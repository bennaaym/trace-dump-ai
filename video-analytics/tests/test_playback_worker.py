from __future__ import annotations

import json

from video_analytics.workers.playback import PlaybackWorker
from video_analytics.xprotect.video_export import VideoProbe


class FakeClient:
    def __init__(self, claim):
        self.claim = claim
        self.calls = []

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if path == "/rest/v1/incident_recordings" and method == "GET":
            return []
        if path.endswith("/rpc/claim_incident_recording"):
            return [self.claim] if self.claim else []
        return None


def test_worker_does_nothing_without_a_claim(tmp_path):
    client = FakeClient(None)
    worker = PlaybackWorker(
        client,
        xprotect_server="http://localhost",
        cache_root=tmp_path,
    )
    assert worker.process_once() is False


def test_worker_reuses_cached_derivative_and_marks_available(tmp_path, monkeypatch):
    claim = {
        "incident_id": "9b16dda3-cf46-5435-9734-d42495519323",
        "recording_identity": "a" * 64,
        "camera_id": "baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
        "recording_start_at": "2026-10-17T19:22:35.843Z",
        "recording_end_at": "2026-10-17T19:22:55.443Z",
    }
    playable = tmp_path / claim["incident_id"] / claim["recording_identity"] / "playback.mp4"
    playable.parent.mkdir(parents=True)
    playable.write_bytes(b"cached mp4")
    monkeypatch.setattr(
        "video_analytics.workers.playback.probe_video",
        lambda path: VideoProbe(19.6, 157, {"streams": []}),
    )
    client = FakeClient(claim)
    worker = PlaybackWorker(
        client,
        xprotect_server="http://localhost",
        cache_root=tmp_path,
    )

    assert worker.process_once() is True
    uploads = [call for call in client.calls if "/storage/v1/object/" in call[1]]
    assert len(uploads) == 1
    updates = [
        call
        for call in client.calls
        if call[0] == "PATCH" and call[1] == "/rest/v1/incident_recordings"
    ]
    assert updates[-1][2]["json"]["status"] == "available"
    assert updates[-1][2]["json"]["duration_seconds"] == 19.6


def test_worker_records_safe_failure_state(tmp_path, monkeypatch):
    claim = {
        "incident_id": "9b16dda3-cf46-5435-9734-d42495519323",
        "recording_identity": "b" * 64,
        "camera_id": "baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
        "recording_start_at": "2026-10-17T19:22:35.843Z",
        "recording_end_at": "2026-10-17T19:22:55.443Z",
    }
    monkeypatch.setattr(
        "video_analytics.workers.playback.run_mip_export",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("camera not accessible")),
    )
    client = FakeClient(claim)
    worker = PlaybackWorker(
        client,
        xprotect_server="http://localhost",
        cache_root=tmp_path,
    )

    assert worker.process_once() is True
    update = [
        call
        for call in client.calls
        if call[0] == "PATCH" and call[1] == "/rest/v1/incident_recordings"
    ][-1]
    assert update[2]["json"]["status"] == "unavailable"
    assert update[2]["json"]["error_code"] == "xprotect_recording_unavailable"


def test_worker_reuses_matching_evidence_export(tmp_path, monkeypatch):
    claim = {
        "incident_id": "9b16dda3-cf46-5435-9734-d42495519323",
        "recording_identity": "c" * 64,
        "camera_id": "baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
        "recording_start_at": "2026-10-17T19:22:35.843Z",
        "recording_end_at": "2026-10-17T19:22:55.443Z",
    }
    runs_root = tmp_path / "runs"
    cache_root = runs_root / "playback"
    export = runs_root / "analyses" / "summary" / "xprotect_export" / "recording.avi"
    export.parent.mkdir(parents=True)
    export.write_bytes(b"exact evidence recording")
    manifest = runs_root / "incidents" / claim["incident_id"] / "incident.json"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(
        json.dumps(
            {
                "id": claim["incident_id"],
                "camera_id": claim["camera_id"],
                "recording_start_utc": claim["recording_start_at"],
                "recording_end_utc": claim["recording_end_at"],
                "xprotect_export_path": str(export),
            }
        ),
        encoding="utf-8",
    )

    def transcode(source, destination, **kwargs):
        assert source == export.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"playable")
        return VideoProbe(19.6, 157, {"streams": []})

    monkeypatch.setattr("video_analytics.workers.playback.transcode_browser_mp4", transcode)
    monkeypatch.setattr(
        "video_analytics.workers.playback.run_mip_export",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("unexpected export")),
    )
    client = FakeClient(claim)
    worker = PlaybackWorker(
        client,
        xprotect_server="http://localhost",
        cache_root=cache_root,
    )

    assert worker.process_once() is True
    update = [
        call
        for call in client.calls
        if call[0] == "PATCH" and call[1] == "/rest/v1/incident_recordings"
    ][-1]
    assert update[2]["json"]["status"] == "available"
    assert update[2]["json"]["provenance"]["source"] == ("validated local evidence AVI export")
