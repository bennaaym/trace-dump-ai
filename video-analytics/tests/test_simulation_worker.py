from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast

import pytest

from video_analytics.cli import _optional_plate_recognizer, build_parser
from video_analytics.config import Settings
from video_analytics.detection.plates import PlateRecognizer
from video_analytics.models import Camera
from video_analytics.workers.simulation import (
    SIMULATION_RUN_SECONDS,
    SimulationWorker,
    _diagnostics,
    _increment,
    _safe_error_message,
)
from video_analytics.xprotect.scene_sources import (
    MappedXProtectCameraSceneAdapter,
    SceneSourceError,
    SceneSourceState,
    UnavailableSceneSourceAdapter,
)
from video_analytics.xprotect.snapshot import FreshSnapshot


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if path.endswith("/camera_scene_sources"):
            return [
                {
                    "id": "20000000-0000-4000-8000-000000000001",
                    "camera_id": "10000000-0000-4000-8000-000000000001",
                    "source_type": "clip",
                    "source_reference": "approved-scene-2",
                    "is_active": True,
                }
            ]
        return None


class MappedCameraClient(FakeClient):
    def __init__(self, *, use_operational_camera=False):
        super().__init__()
        self.use_operational_camera = use_operational_camera

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        target_camera_id = (
            "10000000-0000-4000-8000-000000000001"
            if self.use_operational_camera
            else "30000000-0000-4000-8000-000000000001"
        )
        if path.endswith("/camera_scene_sources"):
            return [
                {
                    "id": "20000000-0000-4000-8000-000000000001",
                    "camera_id": "10000000-0000-4000-8000-000000000001",
                    "source_type": "xprotect_camera",
                    "source_reference": target_camera_id,
                    "target_camera_id": target_camera_id,
                    "is_active": True,
                }
            ]
        if path.endswith("/cameras"):
            return [
                {
                    "id": target_camera_id,
                    "enabled": self.use_operational_camera,
                    "is_scene_check_fixture": not self.use_operational_camera,
                }
            ]
        return None


class ReadyAdapter:
    name = "test"

    def __init__(self) -> None:
        self.switched: tuple[str, str, str] | None = None

    def switch(self, camera_id, source_type, source_reference):
        self.switched = (camera_id, source_type, source_reference)

    def state(self, camera_id):
        return SceneSourceState("approved-scene-2", True, "generation-2")


def test_simulation_capture_window_is_fixed_at_sixty_seconds():
    assert SIMULATION_RUN_SECONDS == 60.0


def _snapshot(timestamp: datetime, digest: str) -> FreshSnapshot:
    return FreshSnapshot("camera", b"jpeg", timestamp, timestamp, 1.0, digest)


def test_unavailable_adapter_never_claims_a_switch():
    adapter = UnavailableSceneSourceAdapter()
    with pytest.raises(SceneSourceError, match="no verified runtime clip-switch API"):
        adapter.switch("camera", "clip", "scene")
    assert adapter.state("camera").ready is False


def test_mapped_camera_adapter_selects_fixture_guid():
    adapter = MappedXProtectCameraSceneAdapter()
    adapter.switch(
        "10000000-0000-4000-8000-000000000001",
        "xprotect_camera",
        "30000000-0000-4000-8000-000000000001",
    )
    state = adapter.state("10000000-0000-4000-8000-000000000001")
    assert state.ready is True
    assert state.capture_camera_id == "30000000-0000-4000-8000-000000000001"


def test_monitoring_requires_and_resolves_a_local_yolo_model(tmp_path):
    model = tmp_path / "synthetic-test-model.pt"
    model.write_bytes(b"synthetic fixture, not a model")
    worker = SimulationWorker(
        FakeClient(), Settings(simulation_yolo_model=str(model)), ReadyAdapter()
    )
    assert worker._local_yolo_model() == str(model.resolve())

    missing = SimulationWorker(FakeClient(), Settings(), ReadyAdapter())
    with pytest.raises(RuntimeError, match="not configured"):
        missing._local_yolo_model()


def test_simulation_worker_configures_background_playback(tmp_path):
    settings = Settings(
        playback_cache_dir=tmp_path / "playback",
        playback_retention_hours=12,
        playback_transcode_threads=2,
    )
    worker = SimulationWorker(FakeClient(), settings, ReadyAdapter(), worker_id="test-simulation")

    playback = worker._playback_worker()

    assert playback.client is worker.client
    assert playback.xprotect_server == settings.xprotect_base_url
    assert playback.cache_root == settings.playback_cache_dir
    assert playback.retention_hours == 12
    assert playback.transcode_threads == 2
    assert playback.worker_id == "test-simulation-playback"


def test_simulation_pipeline_receives_configured_plate_recognizer(tmp_path):
    recognizer = cast(PlateRecognizer, object())
    settings = Settings(
        xprotect_username="operator",
        xprotect_password="secret",
        hafnia_password="secret",
        exports_dir=tmp_path / "exports",
    )
    worker = SimulationWorker(
        FakeClient(),
        settings,
        ReadyAdapter(),
        plate_recognizer=recognizer,
    )

    pipeline = worker._pipeline("run-1", Camera("camera-1", "CAM-01"))

    assert pipeline.plate_recognizer is recognizer


def test_simulation_worker_auto_discovers_local_plate_models(monkeypatch, tmp_path):
    detector = tmp_path / "yolo-v9-t-384-license-plates-end2end.onnx"
    ocr = tmp_path / "cct_xs_v1_global.onnx"
    detector.write_bytes(b"local detector fixture")
    ocr.write_bytes(b"local OCR fixture")
    recognizer = cast(PlateRecognizer, object())
    constructed_with = []
    monkeypatch.setattr(
        "video_analytics.cli.PlateRecognizer",
        lambda directory: constructed_with.append(directory) or recognizer,
    )

    result = _optional_plate_recognizer(tmp_path, enabled=True)

    assert result is recognizer
    assert constructed_with == [tmp_path]


def test_simulation_worker_rejects_missing_plate_models_unless_explicitly_disabled(tmp_path):
    with pytest.raises(RuntimeError, match="local models are missing"):
        _optional_plate_recognizer(tmp_path, enabled=True)
    assert _optional_plate_recognizer(tmp_path, enabled=False) is None


def test_simulation_worker_plate_options_are_available():
    args = build_parser().parse_args(
        ["simulation-worker", "--plate-models-dir", "D:/models/plates", "--no-recognize-plates"]
    )

    assert args.plate_models_dir == "D:/models/plates"
    assert args.no_recognize_plates is True


def test_persisted_worker_errors_redact_download_urls():
    message = _safe_error_message(
        RuntimeError("Download failed https://example.test/model.pt?signature=secret")
    )
    assert message == "Download failed [redacted URL]"


def test_pipeline_diagnostics_are_normalized_and_cumulative():
    diagnostics = _diagnostics({"frames_received": 4, "valid_frames_decoded": -2, "unexpected": 99})
    _increment(diagnostics, frames_received=3, valid_frames_decoded=2)

    assert diagnostics["frames_received"] == 7
    assert diagnostics["valid_frames_decoded"] == 2
    assert diagnostics["hafnia_requests_sent"] == 0
    assert "unexpected" not in diagnostics


def test_scene_switch_requires_backend_and_changed_xprotect_frame(monkeypatch):
    client = FakeClient()
    adapter = ReadyAdapter()
    now = datetime.now(UTC)
    snapshots = iter(
        [
            _snapshot(now - timedelta(seconds=1), "before"),
            _snapshot(now + timedelta(seconds=1), "after"),
        ]
    )
    monkeypatch.setattr(
        "video_analytics.workers.simulation.capture_fresh_snapshot",
        lambda *args, **kwargs: next(snapshots),
    )
    worker = SimulationWorker(client, Settings(scene_source_ready_timeout=1), adapter)
    result = worker._switch_scene(
        {
            "camera_id": "10000000-0000-4000-8000-000000000001",
            "scene_source_id": "20000000-0000-4000-8000-000000000001",
        }
    )
    assert adapter.switched == (
        "10000000-0000-4000-8000-000000000001",
        "clip",
        "approved-scene-2",
    )
    assert result["backend_generation"] == "generation-2"
    assert any(path.endswith("/camera_scene_state") for _, path, _ in client.calls)


def test_scene_switch_rejects_unchanged_xprotect_frame(monkeypatch):
    client = FakeClient()
    now = datetime.now(UTC)
    snapshots = iter(
        [
            _snapshot(now - timedelta(seconds=1), "same"),
            _snapshot(now + timedelta(seconds=1), "same"),
        ]
    )
    monkeypatch.setattr(
        "video_analytics.workers.simulation.capture_fresh_snapshot",
        lambda *args, **kwargs: next(snapshots),
    )
    worker = SimulationWorker(client, Settings(scene_source_ready_timeout=1), ReadyAdapter())
    with pytest.raises(RuntimeError, match="changed frame"):
        worker._switch_scene(
            {
                "camera_id": "10000000-0000-4000-8000-000000000001",
                "scene_source_id": "20000000-0000-4000-8000-000000000001",
            }
        )


def test_scene_switch_verifies_disabled_fixture_camera(monkeypatch):
    client = MappedCameraClient()
    now = datetime.now(UTC)
    captured_camera_ids = []

    def capture(_server, camera_id):
        captured_camera_ids.append(camera_id)
        # Mapped cameras are already-running sources. Their frames may be a few
        # seconds behind wall time even though capture_fresh_snapshot has
        # verified that the stream itself is fresh and advancing.
        return _snapshot(now - timedelta(seconds=3), "fixture")

    monkeypatch.setattr(
        "video_analytics.workers.simulation.capture_fresh_snapshot",
        capture,
    )
    worker = SimulationWorker(
        client,
        Settings(scene_source_ready_timeout=1),
        MappedXProtectCameraSceneAdapter(),
    )
    result = worker._switch_scene(
        {
            "camera_id": "10000000-0000-4000-8000-000000000001",
            "scene_source_id": "20000000-0000-4000-8000-000000000001",
        }
    )

    assert captured_camera_ids == ["30000000-0000-4000-8000-000000000001"]
    assert result["capture_camera_id"] == "30000000-0000-4000-8000-000000000001"


def test_scene_switch_can_select_operational_camera_as_uncleaned_scene(monkeypatch):
    client = MappedCameraClient(use_operational_camera=True)
    now = datetime.now(UTC)
    captured_camera_ids = []

    def capture(_server, camera_id):
        captured_camera_ids.append(camera_id)
        return _snapshot(now + timedelta(seconds=1), "operational")

    monkeypatch.setattr(
        "video_analytics.workers.simulation.capture_fresh_snapshot",
        capture,
    )
    worker = SimulationWorker(
        client,
        Settings(scene_source_ready_timeout=1),
        MappedXProtectCameraSceneAdapter(),
    )
    result = worker._switch_scene(
        {
            "camera_id": "10000000-0000-4000-8000-000000000001",
            "scene_source_id": "20000000-0000-4000-8000-000000000001",
        }
    )

    assert captured_camera_ids == ["10000000-0000-4000-8000-000000000001"]
    assert result["capture_camera_id"] == "10000000-0000-4000-8000-000000000001"
