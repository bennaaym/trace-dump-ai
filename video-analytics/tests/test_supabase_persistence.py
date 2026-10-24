from __future__ import annotations

from pathlib import Path

import video_analytics.db.persistence as persistence
from video_analytics.db.client import SupabaseError
from video_analytics.db.persistence import (
    PendingSyncStore,
    SupabaseAnalysisRepository,
    insert_operation,
    stable_id,
    update_operation,
    upload_operation,
)


class FakeClient:
    def __init__(self, failures: int = 0) -> None:
        self.failures = failures
        self.calls: list[tuple[str, str, dict]] = []

    def request(self, method: str, path: str, **kwargs):
        if self.failures:
            self.failures -= 1
            raise SupabaseError("synthetic temporary outage")
        self.calls.append((method, path, kwargs))
        return None


def test_pending_operations_survive_failure_and_retry_in_order(tmp_path: Path):
    outbox = PendingSyncStore(tmp_path / "pending.json")
    client = FakeClient(failures=1)
    repository = SupabaseAnalysisRepository(client, outbox)
    detection_id = stable_id("detection", "synthetic-run", "camera", "session")
    repository.queue(insert_operation("detections", {"id": detection_id, "camera_id": "camera"}))

    first = repository.flush()
    assert first["synced"] == 0
    assert first["pending"] == 1
    assert outbox.path.is_file()

    second = repository.flush()
    assert second == {"synced": 1, "pending": 0, "error": None}
    assert client.calls[0][0:2] == ("POST", "/rest/v1/detections")


def test_pending_store_retries_transient_windows_replace_denial(tmp_path: Path, monkeypatch):
    real_replace = persistence.os.replace
    attempts = 0

    def flaky_replace(source, destination):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise PermissionError(5, "synthetic Windows file lock")
        real_replace(source, destination)

    monkeypatch.setattr(persistence.os, "replace", flaky_replace)
    monkeypatch.setattr(persistence.time, "sleep", lambda _: None)
    outbox = PendingSyncStore(tmp_path / "pending.json")
    outbox.append(insert_operation("detections", {"id": "detection-1"}))

    assert attempts == 3
    assert outbox.pending()[0]["values"]["id"] == "detection-1"


def test_storage_upload_reads_preserved_local_frame(tmp_path: Path):
    frame = tmp_path / "event.jpg"
    frame.write_bytes(b"synthetic-jpeg")
    client = FakeClient()
    repository = SupabaseAnalysisRepository(client, PendingSyncStore(tmp_path / "pending.json"))
    repository.queue(upload_operation("incidents/incident-id/event.jpg", str(frame)))

    assert repository.flush()["pending"] == 0
    _, path, kwargs = client.calls[0]
    assert path == "/storage/v1/object/incident-evidence/incidents/incident-id/event.jpg"
    assert kwargs["data"] == b"synthetic-jpeg"
    assert kwargs["headers"]["x-upsert"] == "true"


def test_stale_analysis_failure_does_not_regress_completed_record(tmp_path: Path):
    client = FakeClient()
    repository = SupabaseAnalysisRepository(client, PendingSyncStore(tmp_path / "pending.json"))
    repository.queue(
        update_operation(
            "analyses",
            "analysis-1",
            "failed",
            {"status": "failed", "error_message": "synthetic late failure"},
        )
    )

    assert repository.flush()["pending"] == 0
    assert client.calls[0][2]["params"] == {
        "id": "eq.analysis-1",
        "status": "neq.completed",
    }


def test_background_flush_can_be_bounded(tmp_path: Path):
    client = FakeClient()
    outbox = PendingSyncStore(tmp_path / "pending.json")
    repository = SupabaseAnalysisRepository(client, outbox)
    repository.queue(insert_operation("detections", {"id": "detection-1"}))
    repository.queue(insert_operation("detections", {"id": "detection-2"}))

    assert repository.flush(max_operations=1) == {"synced": 1, "pending": 1, "error": None}
    assert len(outbox.pending()) == 1


def test_stable_ids_make_repeated_simulation_records_identical():
    first = stable_id("analysis", "run-1", "camera-1", "session-1")
    second = stable_id("analysis", "run-1", "camera-1", "session-1")
    assert first == second
