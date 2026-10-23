"""Site check tests. Hafnia answers here are synthetic fixtures, not real model output."""

from __future__ import annotations

import pytest

from video_analytics.hafnia.client import HafniaError
from video_analytics.workers.site_check import (
    SiteCheckWorker,
    build_site_check_prompt,
    parse_site_check_response,
)

SYNTHETIC_CLAIM = {
    "check_id": "11111111-1111-4111-8111-111111111111",
    "case_id": "22222222-2222-4222-8222-222222222222",
    "camera_id": "baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
    "window_start_at": "2026-10-23T10:00:00+00:00",
    "window_end_at": "2026-10-23T10:01:00+00:00",
    "recorded_at": "2026-10-21T08:00:00+00:00",
    "classification": "static_dumping",
    "incident_description": "A person leaves three black bags by the fence.",
    "analysis_response": "Dumping detected: Yes\nObjects involved: Three black bin bags\nUncertainties: None",
}


def synthetic_answer(answer: str) -> str:
    return (
        f"Waste still present: {answer}\n"
        "Current view: Synthetic description of the scene.\n"
        "Evidence: Synthetic evidence.\n"
        "Uncertainties: Synthetic uncertainty."
    )


class FakeSupabase:
    def __init__(self, claim):
        self.claim = claim
        self.calls = []

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if path.endswith("/rpc/claim_case_site_check"):
            return [self.claim] if self.claim else []
        return None


class FakeHafnia:
    def __init__(self, answer=None, error=None):
        self.answer = answer
        self.error = error
        self.requests = []

    def create_summary(self, prompt, video_uri, model_id="traffic-general"):
        self.requests.append((prompt, video_uri, model_id))
        if self.error:
            raise self.error
        return {}, {"Id": "summary-1", "Progress": "Queued"}

    def wait_for_summary(self, summary_id, **kwargs):
        return {"Id": summary_id, "Progress": "Completed", "Response": self.answer}


def make_worker(client, hafnia):
    return SiteCheckWorker(
        client,
        hafnia,
        prompt_template="Reported: {objects} / {description} / {classification}",
        prompt_version="site_check_v1",
        model_id="test-model",
    )


@pytest.mark.parametrize(
    ("answer", "expected"),
    [("Yes", "still_present"), ("No", "cleared"), ("Uncertain", "uncertain")],
)
def test_answer_maps_to_a_result(answer, expected):
    assert parse_site_check_response(synthetic_answer(answer))["result"] == expected


def test_unreadable_answer_is_uncertain_not_cleared():
    parsed = parse_site_check_response("The scene is dark and I cannot say.")
    assert parsed["result"] == "uncertain"
    assert parsed["summary"] is None


def test_summary_combines_current_view_and_evidence():
    parsed = parse_site_check_response(synthetic_answer("No"))
    assert parsed["summary"] == "Synthetic description of the scene.\n\nSynthetic evidence."
    assert parsed["uncertainty"] == "Synthetic uncertainty."


def test_prompt_includes_reported_context():
    prompt = build_site_check_prompt(
        "Reported: {objects} / {description} / {classification}",
        classification="static_dumping",
        description="Bags by the fence.",
        analysis_response=SYNTHETIC_CLAIM["analysis_response"],
    )
    assert prompt == "Reported: Three black bin bags / Bags by the fence. / static dumping"


def test_worker_does_nothing_without_a_due_case():
    client = FakeSupabase(None)
    assert make_worker(client, FakeHafnia()).process_once() is False


def test_worker_records_the_result_and_audits_it():
    client = FakeSupabase(SYNTHETIC_CLAIM)
    hafnia = FakeHafnia(answer=synthetic_answer("No"))

    assert make_worker(client, hafnia).process_once() is True

    prompt, uri, model = hafnia.requests[0]
    assert uri.startswith("xprotect://localhost/cameras/baaba7e1-7e9d-4732-8f46-6612ffc9df1e?")
    assert "Three black bin bags" in prompt
    assert model == "test-model"
    update = next(call for call in client.calls if call[0] == "PATCH")
    assert update[2]["params"] == {"id": f"eq.{SYNTHETIC_CLAIM['check_id']}"}
    assert update[2]["json"]["status"] == "completed"
    assert update[2]["json"]["result"] == "cleared"
    event = next(call for call in client.calls if call[1] == "/rest/v1/case_events")
    assert event[2]["json"]["event_type"] == "site_check_completed"
    assert event[2]["json"]["details"]["result"] == "cleared"


def test_failed_hafnia_request_is_a_failed_check_not_a_result():
    client = FakeSupabase(SYNTHETIC_CLAIM)
    hafnia = FakeHafnia(error=HafniaError("gateway unavailable"))

    assert make_worker(client, hafnia).process_once() is True

    update = next(call for call in client.calls if call[0] == "PATCH")
    assert update[2]["json"] == {
        "status": "failed",
        "error_code": "hafnia_failed",
        "lease_owner": None,
        "lease_expires_at": None,
    }
    assert not any(call[1] == "/rest/v1/case_events" for call in client.calls)
