from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np

from video_analytics.detection.activity import (
    ActivityDetector,
    ActivityHit,
    ActivitySessionManager,
    DetectorConfig,
    box_motion_overlap,
    is_motion_hit,
)
from video_analytics.xprotect.live_frames import LiveFrame

CAMERA_ID = "baaba7e1-7e9d-4732-8f46-6612ffc9df1e"


def test_motion_threshold_requires_warmup_and_threshold():
    assert not is_motion_hit(0.5, threshold=0.001, warmed_up=False)
    assert not is_motion_hit(0.0009, threshold=0.001, warmed_up=True)
    assert is_motion_hit(0.001, threshold=0.001, warmed_up=True)


def test_actor_box_motion_overlap_is_clipped_and_fractional():
    mask = np.zeros((10, 10), dtype=np.uint8)
    mask[2:6, 2:4] = 255
    assert box_motion_overlap(mask, (2, 2, 6, 6)) == 0.5
    assert box_motion_overlap(mask, (-10, -10, 0, 0)) == 0.0


def test_activity_sessions_group_hits_and_apply_context():
    config = DetectorConfig(activity_gap_seconds=2, pre_context_seconds=3, post_context_seconds=5)
    manager = ActivitySessionManager(CAMERA_ID, config)
    start = datetime(2026, 10, 16, 14, 45, 20, tzinfo=UTC)
    first = ActivityHit("2026-10-16T14:45:20Z", ("person",), 0.1, 0.5)
    second = ActivityHit("2026-10-16T14:45:21Z", ("car",), 0.1, 0.5)

    assert manager.observe(start, first) == []
    assert manager.observe(start + timedelta(seconds=1), second) == []
    completed = manager.observe(start + timedelta(seconds=3.1), None)

    assert len(completed) == 1
    session = completed[0]
    assert session.activity_start_utc == "2026-10-16T14:45:20.000Z"
    assert session.activity_end_utc == "2026-10-16T14:45:21.000Z"
    assert session.recording_start_utc == "2026-10-16T14:45:17.000Z"
    assert session.recording_end_utc == "2026-10-16T14:45:26.000Z"
    assert session.actor_classes == ("car", "person")
    assert "StartTime=2026-10-16T14:45:17Z" in session.xprotect_uri


def test_detector_associates_actor_motion_and_skips_stale_frame(tmp_path):
    class FakeYolo:
        device = "cpu-test"

        def predict(self, image):
            height, width = image.shape[:2]
            return [(0, "person", 0.9, (0, 0, width, height))], 12.5

    config = DetectorConfig(
        warmup_samples=0, motion_threshold=0.001, detect_shadows=False, max_debug_images=2
    )
    detector = ActivityDetector(
        CAMERA_ID, "Camera", tmp_path / "debug", config=config, yolo=FakeYolo()
    )
    timestamp = datetime(2026, 10, 16, 14, 45, 20, tzinfo=UTC)
    image = np.full((64, 96, 3), 120, dtype=np.uint8)
    frame = LiveFrame(CAMERA_ID, timestamp, "2026-10-16T14:45:20Z", timestamp, 0, 0, "hash", image)
    stale = LiveFrame(
        CAMERA_ID,
        timestamp + timedelta(seconds=1),
        "2026-10-16T14:45:21Z",
        timestamp + timedelta(seconds=7),
        0,
        6000,
        "hash2",
        image,
    )

    detector.process(frame)
    detector.process(stale)
    report = detector.finalize()

    assert report["frames_received"] == 2
    assert report["frames_processed"] == 1
    assert report["stale_frames_skipped"] == 1
    assert report["motion_hits"] == 1
    assert report["yolo_calls"] == 1
    assert report["actor_motion_hits"] == 1
    assert len(report["activity_sessions"]) == 1
    assert report["activity_sessions"][0]["actor_classes"] == ("person",)
    assert len(list((tmp_path / "debug").glob("*.jpg"))) == 1
