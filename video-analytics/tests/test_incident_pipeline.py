from __future__ import annotations

from pathlib import Path

from video_analytics.models import Camera
from video_analytics.workers.incident_pipeline import (
    IncidentPipeline,
    SimulationStateStore,
    parse_dumping_response,
)


class RecordingRepository:
    def __init__(self):
        self.operations = []

    def queue(self, operation):
        self.operations.append(operation)

    def flush(self):
        return {"synced": 0, "pending": len(self.operations), "error": None}


class NegativeHafnia:
    def __init__(self):
        self.requests = 0

    def create_summary(self, prompt, uri, model):
        self.requests += 1
        return {"Prompt": prompt}, {
            "Id": "11111111-1111-1111-1111-111111111111",
            "Progress": "Pending",
        }

    def wait_for_summary(self, summary_id, **kwargs):
        return {
            "Id": summary_id,
            "Progress": "Completed",
            "Response": "Dumping detected: No\nDumping type: Unknown\nEvent timestamp: Unknown",
        }


CAMERA_ID = "baaba7e1-7e9d-4732-8f46-6612ffc9df1e"
SESSION = {
    "id": "session-1",
    "activity_start_utc": "2026-10-16T22:41:43.343Z",
    "activity_end_utc": "2026-10-16T22:41:51.143Z",
    "recording_start_utc": "2026-10-16T22:41:40.343Z",
    "recording_end_utc": "2026-10-16T22:41:56.143Z",
    "xprotect_uri": f"xprotect://localhost/cameras/{CAMERA_ID}?StartTime=2026-10-16T22:41:40.343Z&EndTime=2026-10-16T22:41:56.143Z",
}


def test_parse_positive_response_preserves_fields():
    parsed = parse_dumping_response(
        """Dumping detected: Yes
Dumping type: Dynamic
Event timestamp: Approximately 7.5 seconds from the beginning
Sequence of events: A vehicle passes and an object is released.
People involved: None clearly visible
Vehicles involved: A white vehicle
Objects involved: A bag
Evidence: The bag separates from the vehicle and remains.
Uncertainties: The occupant is not visible."""
    )
    assert parsed["classification"] == "yes"
    assert parsed["dumping_type"] == "dynamic"
    assert parsed["event_offset_seconds"] == 7.5
    assert "object is released" in parsed["description"]
    assert parsed["uncertainty"] == "The occupant is not visible."


def test_parse_negative_and_unstructured_responses_are_conservative():
    negative = parse_dumping_response(
        "**Dumping detected:** No\n\n**Dumping type:** Unknown\n\n**Event timestamp:** Unknown"
    )
    assert negative["classification"] == "no"
    assert negative["event_offset_seconds"] is None
    assert (
        parse_dumping_response("A free-form answer without the requested fields.")["classification"]
        == "uncertain"
    )


def test_simulation_state_suppresses_reserved_submitted_and_completed(tmp_path: Path):
    store = SimulationStateStore(tmp_path / "state.json")
    claimed, _ = store.reserve("demo-001", CAMERA_ID, SESSION)
    assert claimed
    claimed, entry = store.reserve("demo-001", CAMERA_ID, SESSION)
    assert not claimed and entry["status"] == "reserved"
    store.update(
        "demo-001", CAMERA_ID, status="submitted", request_submitted=True, summary_id="summary-1"
    )
    claimed, _ = store.reserve("demo-001", CAMERA_ID, SESSION)
    assert not claimed
    store.update("demo-001", CAMERA_ID, status="completed")
    claimed, _ = store.reserve("demo-001", CAMERA_ID, SESSION)
    assert not claimed


def test_failed_pre_submission_can_retry_but_failed_submitted_request_is_suppressed(tmp_path: Path):
    store = SimulationStateStore(tmp_path / "state.json")
    assert store.reserve("demo-a", CAMERA_ID, SESSION)[0]
    store.update(
        "demo-a", CAMERA_ID, status="failed", request_submitted=False, error="connection refused"
    )
    assert store.reserve("demo-a", CAMERA_ID, SESSION)[0]

    assert store.reserve("demo-b", CAMERA_ID, SESSION)[0]
    store.update(
        "demo-b", CAMERA_ID, status="failed", request_submitted=True, summary_id="summary-2"
    )
    assert not store.reserve("demo-b", CAMERA_ID, SESSION)[0]


def test_positive_incident_is_preserved_when_evidence_export_fails(tmp_path: Path, monkeypatch):
    store = SimulationStateStore(tmp_path / "state.json")
    repository = RecordingRepository()
    pipeline = IncidentPipeline(
        server="http://localhost",
        camera=Camera(CAMERA_ID, "TD-DYN-01-Chartrons"),
        hafnia=None,
        prompt="prompt",
        prompt_version="dumping_v1",
        model_id="traffic-general",
        runs_root=tmp_path,
        simulation_run_id="demo",
        state_store=store,
        poll_interval=0,
        poll_timeout=1,
        repository=repository,
    )
    monkeypatch.setattr(
        "video_analytics.workers.incident_pipeline.run_mip_export",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("export failed")),
    )
    parsed = {
        "classification": "yes",
        "dumping_type": "dynamic",
        "event_offset_seconds": 6.0,
        "description": "Visible object release.",
        "uncertainty": "Object material unknown.",
    }
    analysis_dir = tmp_path / "analyses" / "summary-1"
    analysis_dir.mkdir(parents=True)
    incident_path, status = pipeline._create_incident(
        SESSION, "summary-1", {}, parsed, analysis_dir
    )
    assert status == "failed"
    incident = __import__("json").loads(Path(incident_path).read_text(encoding="utf-8"))
    assert incident["review_status"] == "pending_review"
    assert incident["evidence_status"] == "failed"
    assert "export failed" in incident["evidence_error"]
    incident_inserts = [
        operation
        for operation in repository.operations
        if operation.get("kind") == "insert" and operation.get("table") == "incidents"
    ]
    assert len(incident_inserts) == 1
    assert incident_inserts[0]["values"]["review_status"] == "pending_review"
    assert incident_inserts[0]["values"]["classification"] == "dynamic_dumping"


def test_negative_analysis_is_persisted_without_incident_and_repeat_is_suppressed(tmp_path: Path):
    store = SimulationStateStore(tmp_path / "state.json")
    repository = RecordingRepository()
    hafnia = NegativeHafnia()
    pipeline = IncidentPipeline(
        server="http://localhost",
        camera=Camera(CAMERA_ID, "TD-DYN-01-Chartrons"),
        hafnia=hafnia,
        prompt="synthetic test prompt",
        prompt_version="dumping_v1",
        model_id="traffic-general",
        runs_root=tmp_path,
        simulation_run_id="synthetic-negative-run",
        state_store=store,
        poll_interval=0,
        poll_timeout=1,
        repository=repository,
    )

    first = pipeline.process([SESSION], 1)
    second = pipeline.process([{**SESSION, "id": "new-loop-session"}], 1)

    assert first["requests_submitted"] == 1
    assert first["results"][0]["classification"]["classification"] == "no"
    assert second["requests_submitted"] == 0
    assert second["repeat_sessions_suppressed"] == 1
    assert hafnia.requests == 1
    inserts = [
        operation.get("table")
        for operation in repository.operations
        if operation["kind"] == "insert"
    ]
    assert inserts.count("detections") == 1
    assert inserts.count("analyses") == 1
    assert "incidents" not in inserts
    completed = [
        operation
        for operation in repository.operations
        if operation["kind"] == "update" and operation["key"].endswith(":completed")
    ]
    assert completed[0]["values"]["dumping_detected"] == "no"
