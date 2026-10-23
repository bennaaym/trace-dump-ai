"""Fresh, bounded scene-check snapshots from Milestone JPEGLiveSource."""

from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime

from .live_frames import FrameAcquisitionError, decode_jpeg
from .mip_live import stream_live_jpegs


@dataclass(frozen=True, slots=True)
class FreshSnapshot:
    camera_id: str
    jpeg_bytes: bytes
    source_timestamp: datetime
    captured_at: datetime
    source_age_ms: float
    sha256: str


def capture_fresh_snapshot(
    server: str,
    camera_id: str,
    *,
    max_source_age_seconds: float = 10.0,
    capture_seconds: float = 8.0,
    width: int = 1280,
    height: int = 720,
) -> FreshSnapshot:
    """Require two distinct, advancing source frames and return the newest one."""
    if max_source_age_seconds <= 0 or capture_seconds <= 0:
        raise ValueError("Snapshot freshness and capture duration must be positive")
    previous_timestamp: datetime | None = None
    previous_digest: str | None = None
    stale_reason = "XProtect returned no frames"
    frames = stream_live_jpegs(
        server=server,
        camera_id=camera_id,
        width=width,
        height=height,
        fps=2.0,
        duration_seconds=capture_seconds,
    )
    with closing(frames):
        for item in frames:
            captured_at = datetime.now(UTC)
            frame = decode_jpeg(item, received_at=captured_at)
            source_timestamp = frame.timestamp_utc
            source_age_ms = frame.source_age_ms
            digest = frame.jpeg_sha256
            advancing = previous_timestamp is not None and source_timestamp > previous_timestamp
            changed = previous_digest is not None and digest != previous_digest
            if source_age_ms < -2_000:
                stale_reason = "XProtect frame timestamp is unexpectedly in the future"
            elif source_age_ms > max_source_age_seconds * 1000:
                stale_reason = f"XProtect frame was {source_age_ms:.0f} ms old"
            elif advancing and changed:
                return FreshSnapshot(
                    camera_id=camera_id,
                    jpeg_bytes=item.jpeg_bytes,
                    source_timestamp=source_timestamp,
                    captured_at=captured_at,
                    source_age_ms=max(0.0, source_age_ms),
                    sha256=digest,
                )
            else:
                stale_reason = "XProtect frames were cached, repeated, or not advancing"
            previous_timestamp = source_timestamp
            previous_digest = digest
    raise FrameAcquisitionError(stale_reason)
