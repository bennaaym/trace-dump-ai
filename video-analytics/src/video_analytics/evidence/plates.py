"""Select bounded original video frames and plate crops for human inspection."""

from __future__ import annotations

import hashlib
from datetime import timedelta
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from ..detection.plates import PlateRecognizer
from ..xprotect.client import validate_utc_timestamp
from ..xprotect.video_export import probe_video


def extract_plate_evidence(
    video: Path, directory: Path, start_utc: str, recording_uri: str, recognizer: PlateRecognizer
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    probe = probe_video(video)
    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        raise RuntimeError("Could not open recording for plate inspection")
    directory.mkdir(parents=True, exist_ok=True)
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if fps <= 0 or not np.isfinite(fps) or probe.frame_count < 1:
        capture.release()
        raise RuntimeError("Recording has invalid plate-sampling metadata")
    selected: dict[str, dict[str, Any]] = {}
    sampled = 0
    try:
        for index in np.unique(
            np.linspace(0, probe.frame_count - 1, min(32, probe.frame_count), dtype=int)
        ):
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
            ok, image = capture.read()
            if not ok or image is None:
                continue
            sampled += 1
            for candidate in recognizer.predict(image):
                key = candidate["text"] or "unreadable"
                current = selected.get(key)
                if current is not None and candidate["ocr_score"] <= current["ocr_score"]:
                    continue
                if key not in selected and len(selected) >= 8:
                    continue
                selected[key] = {**candidate, "frame_index": int(index), "image": image.copy()}
    finally:
        capture.release()
    frames = []
    start = validate_utc_timestamp(start_utc)
    for number, candidate in enumerate(
        sorted(selected.values(), key=lambda candidate: candidate["frame_index"])
    ):
        offset = candidate["frame_index"] / fps
        source_key, crop_key = f"plate-{number}-source", f"plate-{number}-crop"
        left, top, right, bottom = candidate["box"]
        for key, pixels, kind in [
            (source_key, candidate["image"], "plate_source"),
            (crop_key, candidate["image"][top:bottom, left:right], "plate_crop"),
        ]:
            path = directory / f"{key}.jpg"
            if not cv2.imwrite(str(path), pixels, [cv2.IMWRITE_JPEG_QUALITY, 95]):
                raise RuntimeError("Could not save plate evidence")
            metadata = {
                "kind": kind,
                "plate_status": candidate["status"],
                "plate_text": candidate["text"],
                "ocr_score": candidate["ocr_score"],
                "detector_score": candidate["detector_score"],
                "box_xyxy": candidate["box"],
                "vehicle_association": "unverified",
                "source_frame_key": source_key,
                **recognizer.provenance,
            }
            frames.append(
                {
                    "role": "representative",
                    "artifact_key": key,
                    "path": str(path.resolve()),
                    "offset_seconds": offset,
                    "timestamp_utc": (start + timedelta(seconds=offset))
                    .isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z"),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "extraction_method": "Original video frame and pixel crop; local plate detector/OCR",
                    "camera_recording_uri": recording_uri,
                    "metadata": metadata,
                }
            )
    return frames, {
        "status": "completed",
        "sampled_frames": sampled,
        "candidates": len(selected),
        "limitations": "Bounded sampling can miss plates; OCR and vehicle involvement require human verification.",
    }
