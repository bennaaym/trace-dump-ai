from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import cv2
import numpy as np
import pytest

from video_analytics.hafnia.scene_comparison import analyze_scene_clip
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
                    "observations": ["The curb area is visible."],
                    "limitations": [],
                    "object_region_observable": False,
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
    assert result.confidence is None


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
