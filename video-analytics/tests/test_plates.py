"""Synthetic plate/OCR fixtures; real model verification is a separate offline check."""

from types import SimpleNamespace

import numpy as np
import pytest

from video_analytics.detection.plates import ALPHABET, PlateRecognizer, decode_plate
from video_analytics.evidence.plates import (
    extract_plate_evidence,
    normalize_plate_text,
    plate_predictions,
)


def scores(text):
    result = np.zeros((9, 37), dtype=np.float32)
    for index, char in enumerate(text.ljust(9, "_")):
        result[index, ALPHABET.index(char)] = 0.99
    return result


def test_ocr_does_not_guess_when_one_character_is_uncertain():
    values = scores("ABC1234")
    values[3] *= 0.5
    assert decode_plate(values)[0] is None
    assert decode_plate(scores("ABC1234"))[0] == "ABC1234"
    assert decode_plate(scores("___"))[0] is None
    assert decode_plate(np.full((9, 37), np.nan))[0] is None


def test_detector_coordinates_are_mapped_back_to_original_image():
    class Session:
        def __init__(self, output):
            self.output = output

        def get_inputs(self):
            return [SimpleNamespace(name="input")]

        def run(self, *_):
            return [self.output]

    recognizer = PlateRecognizer.__new__(PlateRecognizer)
    # 768x384 image -> 384x192, padded vertically by 96 pixels.
    recognizer.detector = Session(
        np.array([[0, 50, 146, 100, 166, 0, 0.9], [0, 0, 0, 1, 1, 0, 0.1]], dtype=np.float32)
    )
    recognizer.ocr = Session(scores("ABC1234")[None])
    predictions = recognizer.predict(np.zeros((384, 768, 3), dtype=np.uint8))
    assert len(predictions) == 1
    assert predictions[0]["box"] == [100, 100, 200, 140]
    assert predictions[0]["text"] == "ABC1234"


def test_explicit_local_models_required(tmp_path):
    pytest.importorskip("onnxruntime")
    with pytest.raises(ValueError, match="Required local plate model"):
        PlateRecognizer(tmp_path)


def test_plate_scan_reads_every_frame_and_keeps_only_involved_vehicle_match(monkeypatch, tmp_path):
    from video_analytics.evidence import plates

    class Capture:
        def __init__(self):
            self.index = 0
            self.visited = []

        def isOpened(self):
            return True

        def get(self, _):
            return 2.0

        def set(self, _, index):
            self.index = int(index)

        def read(self):
            self.visited.append(self.index)
            return True, np.full((32, 64, 3), self.index, dtype=np.uint8)

        def release(self):
            pass

    class Recognizer:
        provenance = {"method": "synthetic-test"}

        def predict(self, image):
            score = 0.8 + float(image[0, 0, 0]) / 100
            return [
                {
                    "text": "AHN 9916",
                    "status": "readable",
                    "ocr_score": score,
                    "detector_score": 0.9,
                    "box": [4, 8, 28, 20],
                },
                {
                    "text": "CJ580TV",
                    "status": "readable",
                    "ocr_score": 0.99,
                    "detector_score": 0.99,
                    "box": [32, 8, 60, 20],
                },
            ]

    capture = Capture()
    monkeypatch.setattr(
        plates,
        "probe_video",
        lambda _: SimpleNamespace(duration_seconds=2.5, frame_count=5),
    )
    monkeypatch.setattr(plates.cv2, "VideoCapture", lambda _: capture)
    frames, report = extract_plate_evidence(
        tmp_path / "synthetic.avi",
        tmp_path / "plates",
        "2026-10-26T00:00:00Z",
        "synthetic recording",
        Recognizer(),
        "AHN-9916",
    )

    assert capture.visited == [0, 1, 2, 3, 4]
    assert len(frames) == 2
    assert {frame["metadata"]["plate_text"] for frame in frames} == {"AHN 9916"}
    assert report == {
        "status": "completed",
        "sampled_frames": 5,
        "candidates": 10,
        "matched_candidates": 1,
        "limitations": "The full exported segment was scanned; only local OCR matching the plate Hafnia attributed to the involved vehicle is retained.",
    }


def test_plate_scan_does_not_promote_unassociated_candidates(tmp_path):
    class Recognizer:
        provenance = {}

    frames, report = extract_plate_evidence(
        tmp_path / "unused.avi",
        tmp_path / "plates",
        "2026-10-26T00:00:00Z",
        "synthetic recording",
        Recognizer(),
        None,
    )
    assert frames == []
    assert report["reason"].startswith("No plate text was attributed")
    assert normalize_plate_text(" AHN-9916 ") == "AHN9916"


def test_portrait_frames_are_tiled_and_boxes_map_to_original_coordinates():
    class Recognizer:
        def __init__(self):
            self.shapes = []

        def predict(self, image):
            self.shapes.append(image.shape[:2])
            return (
                [
                    {
                        "text": "ABC1234",
                        "status": "readable",
                        "ocr_score": 0.9,
                        "detector_score": 0.9,
                        "box": [10, 20, 30, 40],
                    }
                ]
                if len(self.shapes) == 3
                else []
            )

    recognizer = Recognizer()
    predictions = plate_predictions(recognizer, np.zeros((1280, 720, 3), dtype=np.uint8))

    assert recognizer.shapes == [(1280, 720), (720, 720), (720, 720), (720, 720)]
    assert predictions[0]["box"] == [10, 560, 30, 580]
