"""Evidence frame extraction from exported XProtect recordings."""

from __future__ import annotations

import hashlib
import math
from dataclasses import asdict, dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

import cv2

from ..xprotect.client import validate_utc_timestamp
from ..xprotect.video_export import probe_video


@dataclass(frozen=True, slots=True)
class EvidenceFrame:
    role: str
    path: str
    sha256: str
    timestamp_utc: str
    offset_seconds: float
    extraction_method: str = "OpenCV seek in Milestone MIP SDK AVIExporter output"


def extract_evidence_frames(
    video_path: Path,
    evidence_directory: Path,
    recording_start_utc: str,
    recording_uri: str,
    event_offset_seconds: float | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Extract unannotated frames before, during, and after a suspected event."""
    probe = probe_video(video_path)
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"OpenCV could not open XProtect export: {video_path}")
    fps = float(capture.get(cv2.CAP_PROP_FPS)) or (probe.frame_count / probe.duration_seconds)
    known_event = (
        event_offset_seconds is not None
        and math.isfinite(event_offset_seconds)
        and 0 <= event_offset_seconds < probe.duration_seconds
    )
    event_offset = min(
        event_offset_seconds if known_event else probe.duration_seconds / 2.0,
        max(0.0, probe.duration_seconds - 1.0 / fps),
    )
    # Select the event first so a coincident context frame cannot replace it.
    requested = (
        (
            ("event", event_offset),
            ("before", max(0.0, event_offset - 2.0)),
            ("after", min(probe.duration_seconds - 1.0 / fps, event_offset + 2.0)),
        )
        if known_event
        else (("representative", event_offset),)
    )
    evidence_directory.mkdir(parents=True, exist_ok=True)
    start = validate_utc_timestamp(recording_start_utc)
    frames: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    used_indices: set[int] = set()
    try:
        for role, offset in requested:
            frame_index = min(probe.frame_count - 1, max(0, int(round(offset * fps))))
            if frame_index in used_indices:
                continue
            used_indices.add(frame_index)
            try:
                capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, image = capture.read()
                if not ok or image is None:
                    raise RuntimeError(f"Could not decode evidence frame {frame_index}")
                actual_offset = frame_index / fps
                path = evidence_directory / f"{role}.jpg"
                if not cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, 95]):
                    raise RuntimeError(f"Could not save evidence frame: {path}")
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                timestamp = start + timedelta(seconds=actual_offset)
                item = asdict(
                    EvidenceFrame(
                        role,
                        str(path.resolve()),
                        digest,
                        timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                        actual_offset,
                    )
                )
                item["camera_recording_uri"] = recording_uri
                frames.append(item)
            except (OSError, RuntimeError) as exc:
                errors.append({"role": role, "error": str(exc)})
    finally:
        capture.release()
    frames.sort(key=lambda frame: frame["offset_seconds"])
    return frames, {
        "duration_seconds": probe.duration_seconds,
        "frame_count": probe.frame_count,
        "fps": fps,
        "extraction_errors": errors,
    }


def extract_observation_frames(
    video_path: Path,
    evidence_directory: Path,
    recording_start_utc: str,
    recording_uri: str,
    observations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Extract actual source frames for validated observation times; failures stay unlinked."""
    result = []
    for observation in observations[:12]:
        if observation["offset_seconds"] is None:
            continue
        frames, _ = extract_evidence_frames(
            video_path,
            evidence_directory / ("observation-" + observation["id"]),
            recording_start_utc,
            recording_uri,
            observation["offset_seconds"],
        )
        frame = next((frame for frame in frames if frame["role"] == "event"), None)
        if frame is not None:
            result.append(
                {
                    **frame,
                    "role": "representative",
                    "artifact_key": "observation-" + observation["id"],
                    "observation_id": observation["id"],
                }
            )
    return result
