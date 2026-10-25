"""Synthetic model responses used to verify the investigation contract."""

import json

from video_analytics.hafnia.investigation import structured_response
from video_analytics.workers.incident_pipeline import parse_dumping_response


def test_structured_response_validates_and_orders_observations():
    raw = json.dumps(
        {
            "schema_version": "investigation_v1",
            "dumping_detected": "yes",
            "dumping_type": "static",
            "event_offset_seconds": 0.3,
            "description": "Synthetic test narrative",
            "observations": [
                {"id": "later", "offset_seconds": 9, "claim": "Synthetic later observation"},
                {"id": "early", "offset_seconds": 0, "claim": "Synthetic early observation"},
                {"id": "outside", "offset_seconds": 20, "claim": "Synthetic outside observation"},
                {"id": "later", "offset_seconds": 2, "claim": "Duplicate"},
                {"id": "../unsafe", "offset_seconds": 2, "claim": "Unsafe identifier"},
                {"id": "boolean", "offset_seconds": True, "claim": "Invalid timestamp"},
            ],
        }
    )
    parsed = structured_response(raw, 10)
    assert [item["id"] for item in parsed["observations"]] == [
        "early",
        "later",
        "outside",
        "boolean",
    ]
    assert parsed["observations"][2]["offset_seconds"] is None
    assert parsed["observations"][3]["offset_seconds"] is None
    assert parse_dumping_response(raw)["event_offset_seconds"] == 0.3
    assert parse_dumping_response(raw)["classification"] == "yes"


def test_legacy_and_malformed_responses_do_not_invent_observations():
    assert structured_response("Dumping detected: Yes") is None
    assert structured_response('{"schema_version": "investigation_v1"}')["observations"] == []
    assert structured_response("[1,2]") is None


def test_observation_frames_keep_worker_owned_links(monkeypatch, tmp_path):
    from video_analytics.evidence import extraction

    calls = []

    def fake_extract(video, directory, start, uri, offset):
        calls.append(offset)
        return (
            [{"role": "event", "path": str(directory / "event.jpg"), "offset_seconds": offset}],
            {},
        )

    monkeypatch.setattr(extraction, "extract_evidence_frames", fake_extract)
    result = extraction.extract_observation_frames(
        tmp_path / "synthetic.avi",
        tmp_path,
        "2026-10-23T00:00:00Z",
        "synthetic",
        [
            {"id": "first", "offset_seconds": 0},
            {"id": "unknown", "offset_seconds": None},
            {"id": "later", "offset_seconds": 7},
        ],
    )
    assert calls == [0, 7]
    assert [frame["observation_id"] for frame in result] == ["first", "later"]
    assert len({frame["artifact_key"] for frame in result}) == 2
    assert all(frame["role"] == "representative" for frame in result)


def test_timeline_prompt_preserves_previous_detection_instructions():
    from pathlib import Path

    from video_analytics.config import DEFAULT_PROMPT_PATH

    prompts = Path(__file__).parents[1] / "src/video_analytics/hafnia/prompts"
    old = (
        (prompts / "dumping_v2.txt")
        .read_text()
        .split("Return every field below, using exactly these labels:")[0]
        .rstrip()
    )
    current = (prompts / "dumping_v5.txt").read_text()
    assert current.startswith(old + "\n\n")
    assert DEFAULT_PROMPT_PATH.name == "dumping_v7.txt"
    assert 'schema_version: "investigation_v1"' in current


def test_risk_prompt_preserves_entire_previous_prompt():
    from pathlib import Path

    prompts = Path(__file__).parents[1] / "src/video_analytics/hafnia/prompts"
    assert (
        (prompts / "dumping_v5.txt")
        .read_text()
        .startswith((prompts / "dumping_v4.txt").read_text())
    )


def test_explicitly_unsupported_model_timing_is_withheld_not_replaced():
    raw = {
        "schema_version": "investigation_v1",
        "dumping_detected": "yes",
        "deposit_observed": "uncertain",
        "event_timing_basis": "unknown",
        "event_offset_seconds": 0.3,
        "observations": [
            {
                "id": "a",
                "claim": "Synthetic ambiguous action",
                "offset_seconds": 0,
                "timing_basis": "unknown",
            }
        ],
    }
    parsed = parse_dumping_response(json.dumps(raw))
    assert parsed["classification"] == "yes"  # Preserve the actual classification.
    assert parsed["event_offset_seconds"] is None
    assert parsed["observations"][0]["offset_seconds"] is None
    assert "Event time withheld" in parsed["uncertainty"]
    raw.update(deposit_observed="yes", event_timing_basis="visible_release", event_offset_seconds=0)
    assert parse_dumping_response(json.dumps(raw))["event_offset_seconds"] == 0


def test_recording_prompt_uses_actual_duration_and_rejects_invalid_bounds():
    import pytest

    from video_analytics.hafnia.prompting import recording_prompt

    assert "45.875 seconds" in recording_prompt("Synthetic test prompt", 45.875)
    for duration in [0, -1, float("nan"), float("inf")]:
        with pytest.raises(ValueError):
            recording_prompt("Synthetic test prompt", duration)


def test_event_reference_must_match_the_claimed_time():
    raw = {
        "schema_version": "investigation_v1",
        "dumping_detected": "yes",
        "deposit_observed": "yes",
        "event_timing_basis": "visible_release",
        "event_offset_seconds": 0.3,
        "event_observation_id": "release",
        "observations": [{"id": "release", "offset_seconds": 3.4, "claim": "Synthetic release"}],
    }
    assert parse_dumping_response(json.dumps(raw))["event_offset_seconds"] is None
    raw["event_offset_seconds"] = 3.4
    assert parse_dumping_response(json.dumps(raw))["event_offset_seconds"] == 3.4
    del raw["event_observation_id"]
    assert (
        parse_dumping_response(json.dumps(raw), require_event_reference=True)[
            "event_offset_seconds"
        ]
        is None
    )
    assert (
        parse_dumping_response(json.dumps(raw))["event_offset_seconds"] == 3.4
    )  # Legacy compatibility.


def test_narrative_arrays_preserve_uncertainty_and_evidence():
    raw = {
        "schema_version": "investigation_v1",
        "dumping_detected": "uncertain",
        "uncertainty": ["Transfer is obscured", "Timing cannot be determined"],
        "people": [{"description": "Synthetic person", "actions": "Synthetic action"}],
    }
    parsed = parse_dumping_response(json.dumps(raw))
    assert "Transfer is obscured" in parsed["uncertainty"]
    assert "Synthetic action" in parsed["people"]


def test_new_contract_cannot_bypass_event_validation_with_legacy_text():
    raw = "Dumping detected: Yes\nEvent timestamp: 0.3"
    parsed = parse_dumping_response(raw, require_event_reference=True)
    assert parsed["classification"] == "yes"
    assert parsed["event_offset_seconds"] is None
    assert "Event time withheld" in parsed["uncertainty"]
