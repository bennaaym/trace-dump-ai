"""CPU-only plate detector and OCR for the supported local ONNX models."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import cv2
import numpy as np

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_"


def decode_plate(probabilities: np.ndarray, threshold: float = 0.8) -> tuple[str | None, float]:
    scores = np.asarray(probabilities)
    if scores.shape != (9, 37) or not np.isfinite(scores).all():
        return None, 0.0
    indices = scores.argmax(axis=1)
    characters = [
        (ALPHABET[index], float(scores[slot, index]))
        for slot, index in enumerate(indices)
        if ALPHABET[index] != "_"
    ]
    text = "".join(char for char, _ in characters)
    confidence = min((score for _, score in characters), default=0.0)
    return (text if 4 <= len(text) <= 9 and confidence >= threshold else None), confidence


class PlateRecognizer:
    """No remote model names/downloads: explicit local, supported model files only."""

    def __init__(self, models_directory: Path) -> None:
        import onnxruntime as ort

        detector = models_directory / "yolo-v9-t-384-license-plates-end2end.onnx"
        ocr = models_directory / "cct_xs_v1_global.onnx"
        for path in (detector, ocr):
            if not path.is_file():
                raise ValueError(f"Required local plate model not found: {path}")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.detector = ort.InferenceSession(
            str(detector), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self.ocr = ort.InferenceSession(
            str(ocr), sess_options=options, providers=["CPUExecutionProvider"]
        )
        if self.detector.get_inputs()[0].shape != [1, 3, 384, 384] or self.ocr.get_inputs()[
            0
        ].shape[1:] != [64, 128, 3]:
            raise ValueError("Unsupported plate model input contract")
        self.provenance = {
            "detector_sha256": hashlib.sha256(detector.read_bytes()).hexdigest(),
            "ocr_sha256": hashlib.sha256(ocr.read_bytes()).hexdigest(),
            "method": "local ONNX YOLOv9 + CCT v1 OCR; CPU",
            "minimum_character_score": 0.8,
        }

    def predict(self, image: np.ndarray) -> list[dict[str, Any]]:
        height, width = image.shape[:2]
        ratio = min(384 / width, 384 / height)
        resized = (round(width * ratio), round(height * ratio))
        dx, dy = (384 - resized[0]) / 2, (384 - resized[1]) / 2
        canvas = cv2.copyMakeBorder(
            cv2.resize(image, resized),
            round(dy - 0.1),
            round(dy + 0.1),
            round(dx - 0.1),
            round(dx + 0.1),
            cv2.BORDER_CONSTANT,
            value=(114, 114, 114),
        )
        tensor = (
            cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32)
            / 255
        )
        rows = self.detector.run(None, {self.detector.get_inputs()[0].name: tensor})[0]
        if rows.ndim != 2 or rows.shape[1] != 7:
            raise RuntimeError("Unsupported plate detector output contract")
        predictions = []
        for row in sorted(rows, key=lambda row: float(row[6]), reverse=True)[:8]:
            if not np.isfinite(row).all() or row[6] < 0.4:
                continue
            x1, y1, x2, y2 = row[1:5]
            box = (
                max(0, int(np.floor((x1 - dx) / ratio))),
                max(0, int(np.floor((y1 - dy) / ratio))),
                min(width, int(np.ceil((x2 - dx) / ratio))),
                min(height, int(np.ceil((y2 - dy) / ratio))),
            )
            left, top, right, bottom = box
            if right - left < 12 or bottom - top < 6:
                continue
            crop = image[top:bottom, left:right]
            pixels = cv2.cvtColor(
                cv2.resize(crop, (128, 64), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB
            )[None]
            probabilities = self.ocr.run(None, {self.ocr.get_inputs()[0].name: pixels})[0][0]
            text, score = decode_plate(probabilities)
            predictions.append(
                {
                    "text": text,
                    "status": "readable" if text else "unreadable",
                    "ocr_score": score,
                    "detector_score": float(row[6]),
                    "box": list(box),
                }
            )
        return predictions
