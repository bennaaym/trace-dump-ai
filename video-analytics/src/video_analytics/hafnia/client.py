"""Client for the local Hafnia VLM gateway."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import requests

TERMINAL_STATES = frozenset({"Completed", "Failed"})


class HafniaError(RuntimeError):
    """A Hafnia gateway request or response was invalid."""


class HafniaTimeout(HafniaError):
    """A summary did not reach a terminal state in time."""


def parse_summary(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HafniaError("Hafnia summary response was not a JSON object")
    if not isinstance(payload.get("Id"), str) or not payload["Id"]:
        raise HafniaError("Hafnia summary response is missing Id")
    if not isinstance(payload.get("Progress"), str) or not payload["Progress"]:
        raise HafniaError("Hafnia summary response is missing Progress")
    return payload


class HafniaClient:
    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        *,
        verify: bool | str = True,
        timeout: float = 60.0,
        session: requests.Session | None = None,
    ) -> None:
        if not username or not password:
            raise ValueError("Hafnia username and password are required")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self._password = password
        self.verify = verify
        self.timeout = timeout
        self.session = session or requests.Session()
        self._session_id: str | None = None

    def login(self) -> str:
        payload = self._request(
            "POST",
            "/api/Sessions/Login",
            json={"Name": self.username, "Password": self._password},
            authenticated=False,
        )
        session_id = payload.get("Id") if isinstance(payload, dict) else None
        if not isinstance(session_id, str) or not session_id:
            raise HafniaError("Hafnia login response did not contain Id")
        self._session_id = session_id
        return session_id

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        authenticated: bool = True,
        retry_auth: bool = True,
    ) -> Any:
        if authenticated and self._session_id is None:
            self.login()
        headers = {"X-Session-Id": self._session_id} if authenticated else None
        try:
            response = self.session.request(
                method,
                f"{self.base_url}{path}",
                json=json,
                headers=headers,
                verify=self.verify,
                timeout=self.timeout,
            )
            if response.status_code == 401 and authenticated and retry_auth:
                self._session_id = None
                self.login()
                return self._request(method, path, json=json, retry_auth=False)
            response.raise_for_status()
            return response.json() if response.content else None
        except (requests.RequestException, ValueError) as exc:
            raise HafniaError(f"Hafnia {method} {path} failed: {exc}") from exc

    def list_models(self) -> list[dict[str, Any]]:
        payload = self._request("GET", "/api/Models")
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("PageContent"), list):
            return payload["PageContent"]
        raise HafniaError("Hafnia models response was not a list")

    def create_summary(
        self, prompt: str, video_uri: str, model_id: str = "traffic-general"
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if not prompt.strip():
            raise ValueError("Prompt must not be empty")
        request = {"Prompt": prompt, "VideoUris": [video_uri], "AiModelId": model_id}
        return request, parse_summary(self._request("POST", "/api/Summaries", json=request))

    def get_summary(self, summary_id: str) -> dict[str, Any]:
        return parse_summary(self._request("GET", f"/api/Summaries/{summary_id}"))

    def wait_for_summary(
        self,
        summary_id: str,
        *,
        interval: float = 3.0,
        timeout: float = 600.0,
        on_status: Callable[[str], None] | None = None,
        transient_retries: int = 3,
    ) -> dict[str, Any]:
        if interval < 0 or timeout < 0:
            raise ValueError("Polling interval and timeout must not be negative")
        deadline = time.monotonic() + timeout
        previous: str | None = None
        consecutive_errors = 0
        while True:
            try:
                summary = self.get_summary(summary_id)
                consecutive_errors = 0
            except HafniaError:
                consecutive_errors += 1
                if consecutive_errors > transient_retries or time.monotonic() >= deadline:
                    raise
                time.sleep(min(interval, max(0.0, deadline - time.monotonic())))
                continue
            progress = summary["Progress"]
            if progress != previous and on_status:
                on_status(progress)
            previous = progress
            if progress == "Completed":
                return summary
            if progress == "Failed":
                raise HafniaError(
                    f"Hafnia summary {summary_id} failed: {summary.get('LastError', 'unknown error')}"
                )
            if time.monotonic() >= deadline:
                raise HafniaTimeout(
                    f"Hafnia summary {summary_id} did not finish within {timeout:g} seconds"
                )
            time.sleep(min(interval, max(0.0, deadline - time.monotonic())))
