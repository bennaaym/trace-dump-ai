"""Synthetic timing inputs; no model classifications are asserted here."""

import math

import pytest

from video_analytics.workers.incident_pipeline import _event_seconds


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("0 seconds", 0),
        ("0.3", 0.3),
        ("0", 0),
        ("Approximate 0.3", 0.3),
        ("-0.3", None),
        ("0.3-0.5", None),
        ("NaN", None),
        ("Infinity", None),
        ("Approximately 7.5 seconds from the beginning", 7.5),
        ("Approximate 6.0 seconds from the beginning of the video", 6),
        ("00:07.5", 7.5),
        ("-7 seconds", None),
        ("7-9 seconds", None),
        ("00:07 to 00:09", None),
        ("17:04:47", None),
        ("00:75", None),
        ("Unknown", None),
        ("NaN seconds", None),
    ],
)
def test_event_time_requires_one_clip_relative_offset(text, expected):
    assert _event_seconds(text) == expected


@pytest.mark.parametrize(
    ("offset", "expected_roles"),
    [
        (None, ["representative"]),
        (-1, ["representative"]),
        (math.nan, ["representative"]),
        (math.inf, ["representative"]),
        (20, ["representative"]),
        (0, ["event", "after"]),
        (19.99, ["before", "event"]),
    ],
)
def test_unknown_or_invalid_time_uses_representative_frame(
    monkeypatch, tmp_path, offset, expected_roles
):
    from types import SimpleNamespace

    import numpy as np

    from video_analytics.evidence import extraction

    class Capture:
        def isOpened(self):
            return True

        def get(self, _):
            return 10

        def set(self, *_):
            pass

        def read(self):
            return True, np.zeros((8, 8, 3), dtype=np.uint8)

        def release(self):
            pass

    monkeypatch.setattr(
        extraction, "probe_video", lambda _: SimpleNamespace(duration_seconds=20, frame_count=200)
    )
    monkeypatch.setattr(extraction.cv2, "VideoCapture", lambda _: Capture())
    frames, _ = extraction.extract_evidence_frames(
        tmp_path / "synthetic.avi",
        tmp_path / "frames",
        "2026-10-23T00:00:00Z",
        "synthetic test recording",
        offset,
    )
    assert [frame["role"] for frame in frames] == expected_roles


def test_bare_timestamp_in_hafnia_response():
    from video_analytics.workers.incident_pipeline import parse_dumping_response

    # Synthetic minimal reproduction of the timestamp format seen in the live response.
    parsed = parse_dumping_response(
        "Dumping detected: Yes\nEvent timestamp: 0.3\nSequence of events: Synthetic test description."
    )
    assert parsed["event_offset_seconds"] == 0.3
