from __future__ import annotations

import json

import cv2
import numpy as np

from video_analytics.models import XProtectJpeg
from video_analytics.xprotect.live_frames import (
    AcquisitionReport,
    LiveFrameAcquirer,
    write_report_atomic,
)


def _jpeg_bytes(value: int = 80) -> bytes:
    image = np.full((16, 24, 3), value, dtype=np.uint8)
    success, encoded = cv2.imencode(".jpg", image)
    assert success
    return encoded.tobytes()


def test_live_frame_decodes_and_detects_exact_repeat():
    item = XProtectJpeg(
        camera_id="baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
        frame_datetime="2026-10-16T22:10:49.243Z",
        jpeg_bytes=_jpeg_bytes(),
    )

    class Client:
        def get_live_jpeg(self, camera_id, *, width, height):
            assert camera_id == item.camera_id
            assert (width, height) == (640, 360)
            return item

    acquirer = LiveFrameAcquirer(Client(), item.camera_id, width=640, height=360)
    first, first_repeated = acquirer.fetch()
    second, second_repeated = acquirer.fetch()

    assert first.image.shape == (16, 24, 3)
    assert first.timestamp_text == item.frame_datetime
    assert first_repeated is False
    assert second_repeated is True


def test_acquisition_report_is_written_atomically(tmp_path):
    report = AcquisitionReport(
        camera_id="camera-id",
        camera_name="Camera",
        started_at_utc="2026-10-16T22:10:00.000Z",
        finished_at_utc="2026-10-16T22:11:00.000Z",
        unique_frames=10,
    )
    path = tmp_path / "camera-id" / "acquisition.json"

    write_report_atomic(path, report)

    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["camera_id"] == "camera-id"
    assert payload["unique_frames"] == 10
    assert not list(path.parent.glob("*.tmp"))
