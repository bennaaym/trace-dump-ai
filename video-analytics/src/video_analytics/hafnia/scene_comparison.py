"""Supported single-clip Hafnia adapter for cleanup follow-up checks.

The gateway accepts exactly one XProtect recording URI. It does not accept a pair
of uploaded still images, so the original evidence is supplied only as grounded
textual context and automatic clearance remains gated by the database policy.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

from .client import HafniaClient, HafniaError

Assessment = Literal["still_visible", "appears_cleared", "uncertain"]


@dataclass(frozen=True, slots=True)
class SceneComparison:
    assessment: Assessment
    observations: list[str]
    limitations: list[str]
    object_region_observable: bool
    confidence: float | None
    summary_id: str
    model_id: str
    model_version: str | None = None


def build_scene_check_prompt(
    *, incident_description: str, reference_role: str, object_region: Any = None
) -> str:
    region = json.dumps(object_region, separators=(",", ":")) if object_region else "not provided"
    return f"""You are checking a cleanup site after a waste-dumping incident.
Original post-dumping evidence role: {reference_role}.
Investigator incident description: {incident_description}
Investigator-selected object region: {region}

Inspect only the supplied current XProtect clip. Do not claim the site is clear merely because
an object is absent. Report occlusion, darkness, blur, obstruction, or viewpoint mismatch.
Return JSON only with: assessment (still_visible, appears_cleared, or uncertain),
observations (array of grounded visible facts), limitations (array), and
object_region_observable (boolean). Use appears_cleared only when the described waste location
is continuously observable and the described discarded object is visibly absent."""


def analyze_scene_clip(
    client: HafniaClient,
    *,
    video_uri: str,
    incident_description: str,
    reference_role: str,
    object_region: Any,
    model_id: str,
    poll_interval: float,
    poll_timeout: float,
) -> SceneComparison:
    prompt = build_scene_check_prompt(
        incident_description=incident_description,
        reference_role=reference_role,
        object_region=object_region,
    )
    _, created = client.create_summary(prompt, video_uri, model_id)
    summary = client.wait_for_summary(created["Id"], interval=poll_interval, timeout=poll_timeout)
    parsed = _parse_json_response(summary.get("Response"))
    assessment = parsed.get("assessment")
    if assessment not in {"still_visible", "appears_cleared", "uncertain"}:
        raise HafniaError("Scene-check response has an invalid assessment")
    observations = _string_list(parsed.get("observations"))
    limitations = _string_list(parsed.get("limitations"))
    observable = parsed.get("object_region_observable") is True
    if not observable and assessment == "appears_cleared":
        assessment = "uncertain"
        limitations.append("The referenced object region was not observable.")
    return SceneComparison(
        assessment=assessment,
        observations=observations,
        limitations=limitations,
        object_region_observable=observable,
        confidence=None,
        summary_id=summary["Id"],
        model_id=model_id,
    )


def _parse_json_response(value: Any) -> dict[str, Any]:
    if not isinstance(value, str) or not value.strip():
        raise HafniaError("Scene-check response is empty")
    text = value.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HafniaError("Scene-check response is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise HafniaError("Scene-check response is not a JSON object")
    return payload


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]
