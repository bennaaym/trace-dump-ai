"""Bounded live-frame acquisition through XProtect's JpegGetLive REST task."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np

from ..models import Camera
from .client import XProtectClient, XProtectError


class FrameAcquisitionError(RuntimeError):
    """A live JPEG could not be timestamped or decoded."""


@dataclass(frozen=True, slots=True)
class LiveFrame:
    camera_id: str
    timestamp_utc: datetime
    timestamp_text: str
    received_at_utc: datetime
    request_latency_ms: float
    source_age_ms: float
    jpeg_sha256: str
    image: np.ndarray = field(repr=False, compare=False)


@dataclass(slots=True)
class AcquisitionReport:
    camera_id: str
    camera_name: str
    started_at_utc: str
    finished_at_utc: str = ""
    target_fps: float = 5.0
    duration_seconds: float = 0.0
    active_capture_duration_seconds: float = 0.0
    requests: int = 0
    source_frames_received: int = 0
    decoded_frames: int = 0
    unique_frames: int = 0
    repeated_frames: int = 0
    changed_frames: int = 0
    failures: int = 0
    first_frame_utc: str | None = None
    last_frame_utc: str | None = None
    timestamps_advancing: bool = False
    frames_changing: bool = False
    achieved_unique_fps: float = 0.0
    mean_request_latency_ms: float = 0.0
    max_request_latency_ms: float = 0.0
    mean_source_age_ms: float = 0.0
    max_source_age_ms: float = 0.0
    timestamp_source: str = "xprotect.frameDateTime"
    timestamp_precision: str = "server-provided UTC"
    acquisition_method: str = "XProtect Configuration REST API JpegGetLive"
    interrupted: bool = False
    last_error: str | None = None
    _request_latency_total: float = field(default=0.0, repr=False)
    _source_age_total: float = field(default=0.0, repr=False)

    def public_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload.pop("_request_latency_total", None)
        payload.pop("_source_age_total", None)
        return payload


def _utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_xprotect_utc(value: str) -> datetime:
    if not value.endswith("Z"):
        raise FrameAcquisitionError(f"XProtect frame timestamp is not UTC: {value}")
    try:
        return datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise FrameAcquisitionError(f"Invalid XProtect frame timestamp: {value}") from exc


class LiveFrameAcquirer:
    """Fetch and decode one frame at a time; no unbounded frame queue is used."""

    def __init__(
        self, client: XProtectClient, camera_id: str, *, width: int = 1280, height: int = 720
    ) -> None:
        self.client = client
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self._last_timestamp: datetime | None = None
        self._last_hash: str | None = None

    def fetch(self) -> tuple[LiveFrame, bool]:
        started = time.monotonic()
        item = self.client.get_live_jpeg(self.camera_id, width=self.width, height=self.height)
        received = datetime.now(UTC)
        latency_ms = (time.monotonic() - started) * 1000.0
        frame = decode_jpeg(item, received_at=received, acquisition_latency_ms=latency_ms)
        repeated = (
            frame.timestamp_utc == self._last_timestamp and frame.jpeg_sha256 == self._last_hash
        )
        if not repeated:
            self._last_timestamp = frame.timestamp_utc
            self._last_hash = frame.jpeg_sha256
        return frame, repeated


def decode_jpeg(item, *, received_at: datetime, acquisition_latency_ms: float = 0.0) -> LiveFrame:
    """Decode one SDK/REST JPEG item into the common OpenCV frame model."""
    timestamp = _parse_xprotect_utc(item.frame_datetime)
    encoded = np.frombuffer(item.jpeg_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise FrameAcquisitionError("OpenCV could not decode the XProtect JPEG")
    digest = hashlib.sha256(item.jpeg_bytes).hexdigest()
    return LiveFrame(
        camera_id=item.camera_id,
        timestamp_utc=timestamp,
        timestamp_text=item.frame_datetime,
        received_at_utc=received_at,
        request_latency_ms=acquisition_latency_ms,
        source_age_ms=(received_at - timestamp).total_seconds() * 1000.0,
        jpeg_sha256=digest,
        image=image,
    )


def acquire_for_duration(
    client: XProtectClient,
    camera: Camera,
    *,
    duration_seconds: float,
    target_fps: float = 5.0,
    width: int = 1280,
    height: int = 720,
    on_frame: Callable[[LiveFrame, bool], None] | None = None,
) -> AcquisitionReport:
    if duration_seconds <= 0:
        raise ValueError("duration must be positive")
    if target_fps <= 0:
        raise ValueError("fps must be positive")
    report = AcquisitionReport(
        camera_id=camera.id,
        camera_name=camera.name,
        started_at_utc=_utc_text(datetime.now(UTC)),
        target_fps=target_fps,
    )
    acquirer = LiveFrameAcquirer(client, camera.id, width=width, height=height)
    started = time.monotonic()
    deadline = started + duration_seconds
    interval = 1.0 / target_fps
    next_sample = started
    previous_unique_timestamp: datetime | None = None
    previous_unique_hash: str | None = None
    try:
        while time.monotonic() < deadline:
            wait = next_sample - time.monotonic()
            if wait > 0:
                time.sleep(min(wait, max(0.0, deadline - time.monotonic())))
            if time.monotonic() >= deadline:
                break
            report.requests += 1
            try:
                frame, repeated = acquirer.fetch()
            except (XProtectError, FrameAcquisitionError, OSError) as exc:
                report.failures += 1
                report.last_error = str(exc)
            else:
                report.decoded_frames += 1
                report._request_latency_total += frame.request_latency_ms
                report._source_age_total += frame.source_age_ms
                report.max_request_latency_ms = max(
                    report.max_request_latency_ms, frame.request_latency_ms
                )
                report.max_source_age_ms = max(report.max_source_age_ms, frame.source_age_ms)
                if repeated:
                    report.repeated_frames += 1
                else:
                    report.unique_frames += 1
                    report.first_frame_utc = report.first_frame_utc or frame.timestamp_text
                    report.last_frame_utc = frame.timestamp_text
                    if (
                        previous_unique_timestamp is not None
                        and frame.timestamp_utc > previous_unique_timestamp
                    ):
                        report.timestamps_advancing = True
                    if (
                        previous_unique_hash is not None
                        and frame.jpeg_sha256 != previous_unique_hash
                    ):
                        report.changed_frames += 1
                        report.frames_changing = True
                    previous_unique_timestamp = frame.timestamp_utc
                    previous_unique_hash = frame.jpeg_sha256
                if on_frame:
                    on_frame(frame, repeated)
            next_sample += interval
            if next_sample < time.monotonic():
                next_sample = time.monotonic()
    except KeyboardInterrupt:
        report.interrupted = True
    finally:
        report.duration_seconds = max(0.0, time.monotonic() - started)
        report.finished_at_utc = _utc_text(datetime.now(UTC))
        if report.duration_seconds:
            report.achieved_unique_fps = report.unique_frames / report.duration_seconds
        if report.decoded_frames:
            report.mean_request_latency_ms = report._request_latency_total / report.decoded_frames
            report.mean_source_age_ms = report._source_age_total / report.decoded_frames
    return report


def acquire_mip_for_duration(
    server: str,
    camera: Camera,
    *,
    duration_seconds: float,
    target_fps: float = 5.0,
    width: int = 1280,
    height: int = 720,
    on_frame: Callable[[LiveFrame, bool], None] | None = None,
) -> AcquisitionReport:
    """Acquire a bounded live stream using Milestone's JPEGLiveSource component."""
    if duration_seconds <= 0:
        raise ValueError("duration must be positive")
    if target_fps <= 0:
        raise ValueError("fps must be positive")
    from .mip_live import MipLiveError, stream_live_jpegs

    report = AcquisitionReport(
        camera_id=camera.id,
        camera_name=camera.name,
        started_at_utc=_utc_text(datetime.now(UTC)),
        target_fps=target_fps,
        requests=1,
        acquisition_method="Milestone MIP SDK JPEGLiveSource",
    )
    started = time.monotonic()
    previous_timestamp: datetime | None = None
    previous_hash: str | None = None
    first_selected_monotonic: float | None = None
    last_selected_monotonic: float | None = None
    next_selection_monotonic: float | None = None
    selection_interval = 1.0 / target_fps
    try:
        for item in stream_live_jpegs(
            server=server,
            camera_id=camera.id,
            width=width,
            height=height,
            fps=target_fps,
            duration_seconds=duration_seconds,
        ):
            received = datetime.now(UTC)
            received_monotonic = time.monotonic()
            report.source_frames_received += 1
            if (
                next_selection_monotonic is not None
                and received_monotonic < next_selection_monotonic
            ):
                continue
            frame = decode_jpeg(item, received_at=received)
            if next_selection_monotonic is None:
                next_selection_monotonic = received_monotonic + selection_interval
            else:
                while next_selection_monotonic <= received_monotonic:
                    next_selection_monotonic += selection_interval
            first_selected_monotonic = first_selected_monotonic or received_monotonic
            last_selected_monotonic = received_monotonic
            report.decoded_frames += 1
            report._source_age_total += frame.source_age_ms
            report.max_source_age_ms = max(report.max_source_age_ms, frame.source_age_ms)
            repeated = (
                frame.timestamp_utc == previous_timestamp and frame.jpeg_sha256 == previous_hash
            )
            if repeated:
                report.repeated_frames += 1
            else:
                report.unique_frames += 1
                report.first_frame_utc = report.first_frame_utc or frame.timestamp_text
                report.last_frame_utc = frame.timestamp_text
                if previous_timestamp is not None and frame.timestamp_utc > previous_timestamp:
                    report.timestamps_advancing = True
                if previous_hash is not None and frame.jpeg_sha256 != previous_hash:
                    report.changed_frames += 1
                    report.frames_changing = True
                previous_timestamp = frame.timestamp_utc
                previous_hash = frame.jpeg_sha256
            if on_frame:
                on_frame(frame, repeated)
    except KeyboardInterrupt:
        report.interrupted = True
    except (MipLiveError, FrameAcquisitionError, OSError) as exc:
        report.failures += 1
        report.last_error = str(exc)
    finally:
        report.duration_seconds = max(0.0, time.monotonic() - started)
        report.finished_at_utc = _utc_text(datetime.now(UTC))
        if first_selected_monotonic is not None and last_selected_monotonic is not None:
            report.active_capture_duration_seconds = max(
                0.0, last_selected_monotonic - first_selected_monotonic
            )
        if report.active_capture_duration_seconds > 0 and report.unique_frames > 1:
            report.achieved_unique_fps = (
                report.unique_frames - 1
            ) / report.active_capture_duration_seconds
        if report.decoded_frames:
            report.mean_source_age_ms = report._source_age_total / report.decoded_frames
    return report


def write_report_atomic(path: Path, report: AcquisitionReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(report.public_dict(), indent=2, ensure_ascii=False) + "\n"
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
