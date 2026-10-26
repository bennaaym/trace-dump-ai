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

MAX_FULL_SCAN_FRAMES = 600
TILE_OVERLAP = 0.25


def normalize_plate_text(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = "".join(
        character for character in value.upper() if character.isascii() and character.isalnum()
    )
    return normalized if 4 <= len(normalized) <= 9 else None


def plate_predictions(recognizer: PlateRecognizer, image: np.ndarray) -> list[dict[str, Any]]:
    """Preserve detector resolution on portrait/landscape surveillance frames."""
    height, width = image.shape[:2]
    views: list[tuple[int, int, np.ndarray]] = [(0, 0, image)]
    short_side, long_side = min(height, width), max(height, width)
    if short_side > 0 and long_side / short_side >= 1.35:
        step = max(1, round(short_side * (1.0 - TILE_OVERLAP)))
        starts = list(range(0, max(1, long_side - short_side + 1), step))
        final_start = long_side - short_side
        if not starts or starts[-1] != final_start:
            starts.append(final_start)
        if height > width:
            views.extend((0, start, image[start : start + short_side, :]) for start in starts)
        else:
            views.extend((start, 0, image[:, start : start + short_side]) for start in starts)
    predictions = []
    for offset_x, offset_y, view in views:
        for candidate in recognizer.predict(view):
            left, top, right, bottom = candidate["box"]
            predictions.append(
                {
                    **candidate,
                    "box": [
                        left + offset_x,
                        top + offset_y,
                        right + offset_x,
                        bottom + offset_y,
                    ],
                }
            )
    return predictions


def extract_plate_evidence(
    video: Path,
    directory: Path,
    start_utc: str,
    recording_uri: str,
    recognizer: PlateRecognizer,
    involved_vehicle_plate_text: str | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    expected_plate = normalize_plate_text(involved_vehicle_plate_text)
    if expected_plate is None:
        return [], {
            "status": "completed",
            "sampled_frames": 0,
            "candidates": 0,
            "matched_candidates": 0,
            "reason": "No plate text was attributed to the involved vehicle by Hafnia.",
        }
    probe = probe_video(video)
    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        raise RuntimeError("Could not open recording for plate inspection")
    directory.mkdir(parents=True, exist_ok=True)
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if fps <= 0 or not np.isfinite(fps) or probe.frame_count < 1:
        capture.release()
        raise RuntimeError("Recording has invalid plate-sampling metadata")
    if probe.frame_count > MAX_FULL_SCAN_FRAMES:
        capture.release()
        raise RuntimeError(
            f"Recording exceeds the bounded full plate scan limit of {MAX_FULL_SCAN_FRAMES} frames"
        )
    selected: dict[str, dict[str, Any]] = {}
    sampled = 0
    candidates_seen = 0
    try:
        for index in range(probe.frame_count):
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
            ok, image = capture.read()
            if not ok or image is None:
                continue
            sampled += 1
            for candidate in plate_predictions(recognizer, image):
                candidates_seen += 1
                key = normalize_plate_text(candidate["text"])
                if key != expected_plate:
                    continue
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
                "vehicle_association": "hafnia_involved_vehicle_and_local_ocr_match",
                "involved_vehicle_plate_text": expected_plate,
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
        "candidates": candidates_seen,
        "matched_candidates": len(selected),
        "limitations": "The full exported segment was scanned; only local OCR matching the plate Hafnia attributed to the involved vehicle is retained.",
    }
