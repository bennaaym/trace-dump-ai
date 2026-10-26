from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import cv2
import numpy as np
import pytest

from video_analytics.evidence.reference import validate_discarded_object_reference
from video_analytics.hafnia.client import HafniaError
from video_analytics.hafnia.scene_comparison import analyze_scene_clip, build_scene_check_prompt
from video_analytics.models import XProtectJpeg
from video_analytics.workers.scene_checks import SceneCheckWorker
from video_analytics.xprotect.live_frames import FrameAcquisitionError
from video_analytics.xprotect.snapshot import capture_fresh_snapshot


def _jpeg(camera_id: str, timestamp: datetime, body: bytes) -> XProtectJpeg:
    pixel = sum(body) % 256
    success, encoded = cv2.imencode(".jpg", np.full((4, 4, 3), pixel, dtype=np.uint8))
    assert success
    return XProtectJpeg(
        camera_id=camera_id,
        frame_datetime=timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        jpeg_bytes=encoded.tobytes(),
    )


def _stream(frames):
    yield from frames


def test_canonical_incident_evidence_roles_are_valid_legacy_references():
    image = _jpeg("camera", datetime.now(UTC), b"reference").jpeg_bytes

    assert validate_discarded_object_reference(image, {}, role="after") is True
    assert validate_discarded_object_reference(image, {}, role="event") is True
    assert validate_discarded_object_reference(image, {}, role="representative") is True
    assert validate_discarded_object_reference(image, {}, role="before") is False


def test_snapshot_rejects_repeated_cached_frames(monkeypatch):
    now = datetime.now(UTC)
    frames = [_jpeg("camera", now, b"same"), _jpeg("camera", now, b"same")]
    monkeypatch.setattr(
        "video_analytics.xprotect.snapshot.stream_live_jpegs", lambda **kwargs: _stream(frames)
    )
    with pytest.raises(FrameAcquisitionError, match="cached, repeated, or not advancing"):
        capture_fresh_snapshot("http://localhost", "camera")


def test_snapshot_requires_advancing_changed_frame(monkeypatch):
    now = datetime.now(UTC)
    frames = [
        _jpeg("camera", now - timedelta(milliseconds=100), b"first"),
        _jpeg("camera", now, b"second"),
    ]
    monkeypatch.setattr(
        "video_analytics.xprotect.snapshot.stream_live_jpegs", lambda **kwargs: _stream(frames)
    )
    snapshot = capture_fresh_snapshot("http://localhost", "camera")
    assert snapshot.jpeg_bytes != frames[0].jpeg_bytes
    assert abs((snapshot.source_timestamp - now).total_seconds()) < 0.001


def test_scene_check_prompt_focuses_on_reported_waste_and_latest_stable_view():
    prompt = build_scene_check_prompt(
        incident_description="Metal strips beside the left wall",
        reference_role="after",
    )

    assert "exactly one current XProtect clip" in prompt
    assert "latest stable view" in prompt
    assert "Do not assume a looping clip has before/after progression" in prompt
    assert "wet or dry pavement" in prompt
    assert "Historical incident text is NOT visual proof" in prompt
    assert "ordinary pavement texture is not" in prompt
    assert "Metal strips beside the left wall" in prompt


class FakeHafnia:
    def create_summary(self, prompt, video_uri, model_id):
        assert "Return JSON only" in prompt
        assert video_uri.startswith("xprotect://")
        return {}, {"Id": "summary-1", "Progress": "NotStarted"}

    def wait_for_summary(self, summary_id, **kwargs):
        return {
            "Id": summary_id,
            "Progress": "Completed",
            "Response": json.dumps(
                {
                    "assessment": "appears_cleared",
                    "cleanup_area_observable": False,
                    "confidence": 0.96,
                    "cleanup_score": 94,
                    "current_waste_visible": False,
                    "summary": "The reported bag is absent from the inspected curb.",
                    "reported_waste": "A discarded bag",
                    "reported_location": "Beside the curb",
                    "current_observation": "The curb is visible without the reported bag.",
                    "key_changes": ["The reported bag is not visible at the described curb."],
                    "limitations": [],
                }
            ),
        }


def test_unobservable_clear_response_is_downgraded_to_uncertain():
    result = analyze_scene_clip(
        FakeHafnia(),
        video_uri="xprotect://localhost/cameras/camera?StartTime=a&EndTime=b",
        incident_description="A bag beside the curb",
        reference_role="after",
        object_region=None,
        model_id="model",
        poll_interval=0,
        poll_timeout=1,
    )
    assert result.assessment == "uncertain"
    assert result.confidence == 0.96
    assert result.cleanup_score == 94
    assert result.raw_response["assessment"] == "appears_cleared"


class FakeHafniaWithoutConfidence(FakeHafnia):
    def wait_for_summary(self, summary_id, **kwargs):
        result = super().wait_for_summary(summary_id, **kwargs)
        response = json.loads(result["Response"])
        response["cleanup_area_observable"] = True
        del response["confidence"]
        result["Response"] = json.dumps(response)
        return result


def test_scene_check_requires_confidence_for_an_automatic_decision():
    with pytest.raises(HafniaError, match="clearance response is missing numeric confidence"):
        analyze_scene_clip(
            FakeHafniaWithoutConfidence(),
            video_uri="xprotect://localhost/cameras/camera?StartTime=a&EndTime=b",
            incident_description="A bag beside the curb",
            reference_role="after",
            object_region=None,
            model_id="model",
            poll_interval=0,
            poll_timeout=1,
        )


class FakeHafniaWithoutOptionalMetrics(FakeHafnia):
    def wait_for_summary(self, summary_id, **kwargs):
        result = super().wait_for_summary(summary_id, **kwargs)
        response = json.loads(result["Response"])
        response["cleanup_area_observable"] = True
        response["key_changes"] = []
        response.pop("cleanup_score")
        result["Response"] = json.dumps(response)
        return result


def test_scene_check_requires_cleanup_score_for_an_automatic_decision():
    with pytest.raises(HafniaError, match="clearance response is missing numeric cleanup_score"):
        analyze_scene_clip(
            FakeHafniaWithoutOptionalMetrics(),
            video_uri="xprotect://localhost/cameras/camera?StartTime=a&EndTime=b",
            incident_description="A bag beside the curb",
            reference_role="after",
            object_region=None,
            model_id="model",
            poll_interval=0,
            poll_timeout=1,
        )


class FakeHafniaContradictoryClearScene(FakeHafnia):
    def wait_for_summary(self, summary_id, **kwargs):
        result = super().wait_for_summary(summary_id, **kwargs)
        response = json.loads(result["Response"])
        response.update(
            {
                "assessment": "still_visible",
                "cleanup_score": 0,
                "confidence": 0.99,
                "current_waste_visible": False,
                "cleanup_area_observable": True,
            }
        )
        result["Response"] = json.dumps(response)
        return result


def test_contradictory_visibility_is_preserved_raw_and_marked_uncertain():
    result = analyze_scene_clip(
        FakeHafniaContradictoryClearScene(),
        video_uri="xprotect://localhost/cameras/camera?StartTime=a&EndTime=b",
        incident_description="A large flat object on the pavement behind an orange van",
        reference_role="after",
        object_region=None,
        model_id="model",
        poll_interval=0,
        poll_timeout=1,
    )

    assert result.assessment == "uncertain"
    assert result.cleanup_score == 0
    assert result.raw_response["assessment"] == "still_visible"
    assert any("conflicted" in limitation for limitation in result.limitations)


class FakeHafniaLongSummary(FakeHafnia):
    def wait_for_summary(self, summary_id, **kwargs):
        result = super().wait_for_summary(summary_id, **kwargs)
        response = json.loads(result["Response"])
        response["summary"] = "word " * 26
        result["Response"] = json.dumps(response)
        return result


def test_scene_check_rejects_excessively_long_summary():
    with pytest.raises(HafniaError, match="summary is too long"):
        analyze_scene_clip(
            FakeHafniaLongSummary(),
            video_uri="xprotect://localhost/cameras/camera?StartTime=a&EndTime=b",
            incident_description="A bag beside the curb",
            reference_role="after",
            object_region=None,
            model_id="model",
            poll_interval=0,
            poll_timeout=1,
        )


def test_scene_check_rejects_missing_incident_description():
    with pytest.raises(HafniaError, match="incident description"):
        analyze_scene_clip(
            FakeHafnia(),
            video_uri="xprotect://localhost/cameras/camera?StartTime=a&EndTime=b",
            incident_description=" ",
            reference_role="after",
            object_region=None,
            model_id="model",
            poll_interval=0,
            poll_timeout=1,
        )


class FakeHafniaInvalidAssessment(FakeHafnia):
    def wait_for_summary(self, summary_id, **kwargs):
        result = super().wait_for_summary(summary_id, **kwargs)
        response = json.loads(result["Response"])
        response["assessment"] = "clean"
        result["Response"] = json.dumps(response)
        return result


def test_scene_check_rejects_invalid_assessment():
    with pytest.raises(HafniaError, match="invalid assessment"):
        analyze_scene_clip(
            FakeHafniaInvalidAssessment(),
            video_uri="xprotect://localhost/cameras/camera?StartTime=a&EndTime=b",
            incident_description="A bag beside the curb",
            reference_role="after",
            object_region=None,
            model_id="model",
            poll_interval=0,
            poll_timeout=1,
        )


class FakeClient:
    def __init__(self, claim):
        self.claim = claim
        self.calls = []

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if path.endswith("/rpc/claim_cleanup_scene_check"):
            return [self.claim] if self.claim else []
        if path == "/rest/v1/cleanup_cases":
            return [{"status": "in_progress"}]
        if path == "/rest/v1/cleanup_scene_checks":
            return [
                {
                    "status": "running",
                    "cancellation_requested": False,
                    "lease_owner": "worker",
                }
            ]
        if path == "/rest/v1/camera_scene_state":
            return None
        if path.startswith("/storage/v1/object/incident-evidence/"):
            return b"synthetic invalid image fixture"
        return None


def _claim(**overrides):
    return {
        "id": "10000000-0000-4000-8000-000000000001",
        "cleanup_case_id": "20000000-0000-4000-8000-000000000001",
        "camera_id": "30000000-0000-4000-8000-000000000001",
        "attempt_count": 1,
        "max_attempts": 3,
        "reference_evidence_id": None,
        "reference_storage_path": None,
        "automatic_resolution_enabled": False,
        "confidence_policy_validated": False,
        "looping_source": True,
        **overrides,
    }


def test_missing_reference_is_uncertain_without_camera_or_hafnia(monkeypatch):
    client = FakeClient(_claim())
    monkeypatch.setattr(
        "video_analytics.workers.scene_checks.capture_fresh_snapshot",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("unexpected capture")),
    )
    worker = SceneCheckWorker(
        client,
        FakeHafnia(),
        xprotect_server="http://localhost",
        model_id="model",
        worker_id="worker",
    )
    assert worker.process_once() is True
    finish = [call for call in client.calls if call[1].endswith("finish_cleanup_scene_check")][0]
    result = finish[2]["json"]["p_result"]
    assert result["assessment"] == "uncertain"
    assert result["status"] == "completed"
    assert result["automatic_resolution_enabled"] is False


def test_transient_camera_failure_requests_bounded_retry(monkeypatch):
    client = FakeClient(
        _claim(
            reference_evidence_id="40000000-0000-4000-8000-000000000001",
            reference_storage_path="incidents/i/after.jpg",
            reference_metadata={"discarded_object_visible": True},
        )
    )
    monkeypatch.setattr(
        "video_analytics.workers.scene_checks.capture_fresh_snapshot",
        lambda *args, **kwargs: (_ for _ in ()).throw(FrameAcquisitionError("offline")),
    )
    worker = SceneCheckWorker(
        client,
        FakeHafnia(),
        xprotect_server="http://localhost",
        model_id="model",
        worker_id="worker",
    )
    assert worker.process_once() is True
    finish = [call for call in client.calls if call[1].endswith("finish_cleanup_scene_check")][0]
    result = finish[2]["json"]["p_result"]
    assert result["status"] == "retry"
    assert result["assessment"] == "uncertain"
    assert result["error_code"] == "capture_failed"


def test_scene_check_keeps_using_selected_mapped_fixture_camera(monkeypatch):
    logical_camera_id = "30000000-0000-4000-8000-000000000001"
    fixture_camera_id = "50000000-0000-4000-8000-000000000001"
    client = FakeClient(
        _claim(
            camera_id=logical_camera_id,
            reference_evidence_id="40000000-0000-4000-8000-000000000001",
            reference_storage_path="incidents/i/after.jpg",
            reference_role="after",
            reference_metadata={"discarded_object_visible": True},
            incident_description="An orange bag in the road",
        )
    )
    original_request = client.request

    def request(method, path, **kwargs):
        if path == "/rest/v1/camera_scene_state":
            return [
                {
                    "status": "ready",
                    "verified_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
                    "capture_camera_id": fixture_camera_id,
                }
            ]
        if path.startswith("/storage/v1/object/incident-evidence/"):
            success, encoded = cv2.imencode(".jpg", np.full((4, 4, 3), 100, dtype=np.uint8))
            assert success
            return encoded.tobytes()
        return original_request(method, path, **kwargs)

    client.request = request
    captured_camera_ids = []

    def capture(_server, camera_id):
        captured_camera_ids.append(camera_id)
        now = datetime.now(UTC)
        return type(
            "Snapshot",
            (),
            {
                "jpeg_bytes": b"jpeg",
                "source_timestamp": now - timedelta(seconds=3),
                "captured_at": now,
                "source_age_ms": 0.0,
            },
        )()

    monkeypatch.setattr("video_analytics.workers.scene_checks.capture_fresh_snapshot", capture)
    worker = SceneCheckWorker(
        client,
        FakeHafnia(),
        xprotect_server="http://localhost",
        model_id="model",
        recording_settle_seconds=0,
        worker_id="worker",
    )

    assert worker.process_once() is True
    assert captured_camera_ids == [fixture_camera_id]
    hafnia_calls = [call for call in client.calls if call[1].endswith("finish_cleanup_scene_check")]
    result = hafnia_calls[0][2]["json"]["p_result"]
    assert result["follow_up_source"] == "Configured simulated XProtect fixture camera"
    assert result["gateway_input_limitations"]


def test_scene_check_does_not_fall_back_when_selected_scene_is_not_ready():
    client = FakeClient(_claim())
    original_request = client.request

    def request(method, path, **kwargs):
        if path == "/rest/v1/camera_scene_state":
            return [{"status": "error", "capture_camera_id": None}]
        return original_request(method, path, **kwargs)

    client.request = request
    worker = SceneCheckWorker(
        client,
        FakeHafnia(),
        xprotect_server="http://localhost",
        model_id="model",
        worker_id="worker",
    )

    with pytest.raises(RuntimeError, match="selected scene source is not ready"):
        worker._capture_camera_id("30000000-0000-4000-8000-000000000001")
