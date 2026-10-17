from __future__ import annotations

import pytest
import requests

from video_analytics.hafnia.client import HafniaClient, HafniaError, HafniaTimeout, parse_summary


class FakeResponse:
    def __init__(self, payload=None, status=200):
        self.payload = payload
        self.status_code = status
        self.content = b"{}" if payload is not None else b""

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.responses.pop(0)


def test_summary_response_parsing_preserves_raw_fields():
    payload = {
        "Id": "s1",
        "Progress": "Completed",
        "Response": "visible evidence",
        "Extra": {"a": 1},
    }
    assert parse_summary(payload) is payload
    with pytest.raises(HafniaError, match="missing Progress"):
        parse_summary({"Id": "s1"})


def test_polling_reaches_completed(monkeypatch):
    client = object.__new__(HafniaClient)
    states = iter(
        [
            {"Id": "s1", "Progress": "FetchingVideo"},
            {"Id": "s1", "Progress": "Completed", "Response": "done"},
        ]
    )
    client.get_summary = lambda summary_id: next(states)
    monkeypatch.setattr("video_analytics.hafnia.client.time.sleep", lambda _: None)
    result = client.wait_for_summary("s1", interval=0, timeout=10)
    assert result["Response"] == "done"


def test_polling_failed_is_terminal():
    client = object.__new__(HafniaClient)
    client.get_summary = lambda summary_id: {
        "Id": "s1",
        "Progress": "Failed",
        "LastError": "bad clip",
    }
    with pytest.raises(HafniaError, match="bad clip"):
        client.wait_for_summary("s1", interval=0, timeout=1)


def test_polling_timeout(monkeypatch):
    client = object.__new__(HafniaClient)
    client.get_summary = lambda summary_id: {"Id": "s1", "Progress": "NotStarted"}
    clock = iter([0.0, 1.0, 2.0])
    monkeypatch.setattr("video_analytics.hafnia.client.time.monotonic", lambda: next(clock))
    monkeypatch.setattr("video_analytics.hafnia.client.time.sleep", lambda _: None)
    with pytest.raises(HafniaTimeout):
        client.wait_for_summary("s1", interval=0, timeout=1)


def test_polling_retries_transient_gateway_error(monkeypatch):
    client = object.__new__(HafniaClient)
    calls = 0

    def get_summary(summary_id):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise HafniaError("temporary gateway error")
        return {"Id": "s1", "Progress": "Completed", "Response": "done"}

    client.get_summary = get_summary
    monkeypatch.setattr("video_analytics.hafnia.client.time.sleep", lambda _: None)
    result = client.wait_for_summary("s1", interval=0, timeout=10, transient_retries=1)
    assert calls == 2
    assert result["Progress"] == "Completed"


def test_http_error_is_wrapped():
    fake = FakeSession([FakeResponse({}, 500)])
    client = HafniaClient("https://localhost:15443", "administrator", "pass", session=fake)
    with pytest.raises(HafniaError, match="failed"):
        client.login()
