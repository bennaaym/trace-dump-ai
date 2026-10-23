"""AI site checks for overdue cases: has the reported waste been cleared?

The result is a lead for human review. It never resolves a case, and anything the
model cannot establish clearly is recorded as ``uncertain``.
"""

from __future__ import annotations

import logging
import re
import socket
import time
from datetime import UTC, datetime
from typing import Any

from ..db.client import SupabaseClient
from ..hafnia.client import HafniaClient, HafniaError
from ..xprotect.client import build_xprotect_uri
from .incident_pipeline import parse_dumping_response

logger = logging.getLogger(__name__)

FIELD_NAMES = ("Waste still present", "Current view", "Evidence", "Uncertainties")
RESULTS = {"yes": "still_present", "no": "cleared", "uncertain": "uncertain"}
MAX_CONTEXT_CHARS = 1500


def _field(response: str, name: str) -> str | None:
    labels = "|".join(re.escape(item) for item in FIELD_NAMES)
    match = re.search(
        rf"(?ims)^\s*(?:\*\*)?{re.escape(name)}(?:\*\*)?\s*:\s*(.*?)(?=^\s*(?:\*\*)?(?:{labels})(?:\*\*)?\s*:|\Z)",
        response,
    )
    return match.group(1).strip() if match else None


def parse_site_check_response(response: str) -> dict[str, str | None]:
    """Map a Hafnia answer to a result. Anything unreadable is ``uncertain``."""
    answer = _field(response, "Waste still present") or ""
    token = re.search(r"\b(yes|no|uncertain)\b", answer, re.I)
    result = RESULTS[token.group(1).lower()] if token else "uncertain"
    summary = "\n\n".join(
        part for part in (_field(response, "Current view"), _field(response, "Evidence")) if part
    )
    return {
        "result": result,
        "summary": summary or None,
        "uncertainty": _field(response, "Uncertainties"),
    }


def build_site_check_prompt(
    template: str, *, classification: str, description: str, analysis_response: str | None
) -> str:
    objects = (
        str(parse_dumping_response(analysis_response).get("objects") or "")
        if analysis_response
        else ""
    )
    values = {
        "{classification}": classification.replace("_", " "),
        "{objects}": objects[:MAX_CONTEXT_CHARS] or "Not recorded",
        "{description}": description[:MAX_CONTEXT_CHARS] or "Not recorded",
    }
    prompt = template
    for placeholder, value in values.items():
        prompt = prompt.replace(placeholder, value)
    return prompt


def _parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Site check timestamp is missing a timezone")
    return parsed.astimezone(UTC)


def _utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _error_code(exc: Exception) -> str:
    if isinstance(exc, HafniaError):
        return "hafnia_failed"
    if isinstance(exc, ValueError):
        return "invalid_request"
    return "check_failed"


class SiteCheckWorker:
    def __init__(
        self,
        client: SupabaseClient,
        hafnia: HafniaClient,
        *,
        prompt_template: str,
        prompt_version: str,
        model_id: str,
        poll_interval: float = 3.0,
        poll_timeout: float = 600.0,
        min_interval_hours: int = 12,
        daily_limit: int = 20,
        window_seconds: int = 60,
        worker_id: str | None = None,
    ) -> None:
        self.client = client
        self.hafnia = hafnia
        self.prompt_template = prompt_template
        self.prompt_version = prompt_version
        self.model_id = model_id
        self.poll_interval = poll_interval
        self.poll_timeout = poll_timeout
        self.min_interval_hours = min_interval_hours
        self.daily_limit = daily_limit
        self.window_seconds = window_seconds
        self.worker_id = worker_id or f"{socket.gethostname()}-{id(self):x}"

    def process_once(self) -> bool:
        rows = self.client.request(
            "POST",
            "/rest/v1/rpc/claim_case_site_check",
            json={
                "p_worker_id": self.worker_id,
                "p_prompt_version": self.prompt_version,
                "p_model_id": self.model_id,
                "p_min_interval_hours": self.min_interval_hours,
                "p_daily_limit": self.daily_limit,
                "p_window_seconds": self.window_seconds,
            },
        )
        if not rows:
            return False
        claim = rows[0]
        try:
            self._check(claim)
        except Exception as exc:
            logger.exception(
                "site_check_failed check_id=%s case_id=%s", claim["check_id"], claim["case_id"]
            )
            self._update(
                claim["check_id"],
                {
                    "status": "failed",
                    "error_code": _error_code(exc),
                    "lease_owner": None,
                    "lease_expires_at": None,
                },
            )
        return True

    def run(self, *, poll_seconds: float = 60.0) -> None:
        while True:
            if not self.process_once():
                time.sleep(max(5.0, poll_seconds))

    def _check(self, claim: dict[str, Any]) -> None:
        uri = build_xprotect_uri(
            claim["camera_id"],
            _utc_text(_parse_utc(claim["window_start_at"])),
            _utc_text(_parse_utc(claim["window_end_at"])),
        )
        prompt = build_site_check_prompt(
            self.prompt_template,
            classification=claim.get("classification") or "unknown dumping",
            description=claim.get("incident_description") or "",
            analysis_response=claim.get("analysis_response"),
        )
        _, created = self.hafnia.create_summary(prompt, uri, self.model_id)
        summary_id = created["Id"]
        response = self.hafnia.wait_for_summary(
            summary_id, interval=self.poll_interval, timeout=self.poll_timeout
        )
        parsed = parse_site_check_response(response.get("Response") or "")
        self._update(
            claim["check_id"],
            {
                "status": "completed",
                "result": parsed["result"],
                "summary": parsed["summary"],
                "uncertainty": parsed["uncertainty"],
                "hafnia_summary_id": summary_id,
                "raw_response": response,
                "completed_at": _utc_text(datetime.now(UTC)),
                "lease_owner": None,
                "lease_expires_at": None,
                "error_code": None,
            },
        )
        self.client.request(
            "POST",
            "/rest/v1/case_events",
            json={
                "case_id": claim["case_id"],
                "event_type": "site_check_completed",
                "details": {"check_id": claim["check_id"], "result": parsed["result"]},
            },
            headers={"Prefer": "return=minimal"},
        )
        logger.info(
            "site_check_completed check_id=%s case_id=%s result=%s",
            claim["check_id"],
            claim["case_id"],
            parsed["result"],
        )

    def _update(self, check_id: str, values: dict[str, Any]) -> None:
        self.client.request(
            "PATCH",
            "/rest/v1/case_site_checks",
            params={"id": f"eq.{check_id}"},
            json=values,
            headers={"Prefer": "return=minimal"},
        )
