"""Synthetic plate/OCR fixtures; real model verification is a separate offline check."""

from types import SimpleNamespace

import numpy as np
import pytest

from video_analytics.detection.plates import ALPHABET, PlateRecognizer, decode_plate


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
