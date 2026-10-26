"""Supported single-clip Hafnia adapter for cleanup follow-up checks.

The gateway accepts one XProtect recording URI. The original evidence is not
attached to that request, so incident text is historical context and every
current-scene claim must be grounded in the supplied clip.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from typing import Any, Literal

from .client import HafniaClient, HafniaError

Assessment = Literal["still_visible", "appears_cleared", "uncertain"]


@dataclass(frozen=True, slots=True)
class SceneComparison:
    assessment: Assessment
    cleanup_area_observable: bool
    current_waste_visible: bool | None
    summary: str
    reported_waste: str
    reported_location: str
    current_observation: str
    key_changes: list[str]
    limitations: list[str]
    confidence: float | None
    cleanup_score: float | None
    raw_response: dict[str, Any]
    summary_id: str
    model_id: str
    model_version: str | None = None


def build_scene_check_prompt(
    *, incident_description: str, reference_role: str, object_region: Any = None
) -> str:
    region_context = (
        "A reference waste region exists in stored evidence metadata, but it is not attached to "
        "this Hafnia request. Do not claim to have inspected that region."
        if object_region is not None
        else "No reference waste region is supplied to Hafnia."
    )
    return f"""You verify whether reported dumped material remains at a cleanup site.

Historical incident context ({reference_role} evidence record):
{incident_description}

Input constraint: the gateway supplies exactly one current XProtect clip. It does not supply the
stored original image. Treat the incident text only as reported historical context and describe
the clip as the currently observed scene. {region_context}

Answer only this question: Has the originally reported dumped material been removed from the
reported area?

First identify from the incident text:
1. the reported waste material; and
2. its reported location using stable scene landmarks.

Then inspect the latest stable view in the current clip and determine:
1. whether that location can be meaningfully observed;
2. whether the reported material is currently visible there; and
3. the resulting assessment.

Decision rules:
- still_visible: the reported dumped material itself is visibly present.
- appears_cleared: the reported location is observable and the reported material is absent.
- uncertain: the location cannot be identified, is obstructed, the footage is insufficient, or
  the material cannot be distinguished.

Strict grounding for a still_visible result:
- Historical incident text is NOT visual proof that material remains. Never repeat a historical
  waste description as a current observation unless you can see that discrete item in this clip.
- Return still_visible only when a bounded physical object is visibly distinguishable from the
  road or pavement and can be described with its current landmark. A wet patch, reflection,
  shadow, curb, painted area, stain, compression artifact, or ordinary pavement texture is not
  dumped material.
- If the reported location is plainly visible and no discrete item is distinguishable there,
  return appears_cleared with current_waste_visible false. Do not require a person, vehicle,
  cleaning action, or before/after progression in the current clip.
- If you cannot distinguish a concrete object from the surface, return uncertain; do not call it
  still_visible.

Do not use vehicle or person departure, lack of dumping or cleanup activity, wet or dry pavement,
or the general appearance of an empty road as proof. Mention one only if it materially obstructs
the reported waste area. Do not assume a looping clip has before/after progression. If genuine
multiple states are visible you may report the relevant change; otherwise assess the latest stable
state against the incident text. Do not claim to have seen an image or frame that was not supplied.

Return JSON only as one object:
{{
  "assessment": "still_visible" | "appears_cleared" | "uncertain",
  "cleanup_area_observable": boolean,
  "current_waste_visible": true | false | null,
  "confidence": number from 0 to 1,
  "summary": "one conclusion sentence, no more than 25 words",
  "reported_waste": "short waste description taken from the incident context",
  "reported_location": "short location description from the incident context",
  "current_observation": "one concise statement grounded in the current clip",
  "key_changes": ["at most two concise reported-before versus observed-now findings"],
  "limitations": ["at most two material visibility or context limitations"],
  "cleanup_score": number from 0 to 100
}}

cleanup_score is retained only for the existing decision-policy contract: 0 means evidence strongly
supports that the waste remains; 100 means evidence strongly supports that it is absent from an
observable reported area. It is distinct from confidence. Do not derive either value from the other.
Use an empty limitations array when there is no material limitation."""


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
    if not incident_description.strip():
        raise HafniaError("Scene check requires an incident description")
    prompt = build_scene_check_prompt(
        incident_description=incident_description,
        reference_role=reference_role,
        object_region=object_region,
    )
    _, created = client.create_summary(prompt, video_uri, model_id)
    summary_result = client.wait_for_summary(
        created["Id"], interval=poll_interval, timeout=poll_timeout
    )
    parsed = _parse_json_response(summary_result.get("Response"))
    reported_assessment = parsed.get("assessment")
    if reported_assessment not in {"still_visible", "appears_cleared", "uncertain"}:
        raise HafniaError("Scene-check response has an invalid assessment")

    observable = _required_bool(parsed.get("cleanup_area_observable"), "cleanup_area_observable")
    current_waste_visible = _current_waste_visible(parsed.get("current_waste_visible"))
    response_summary = _required_text(parsed.get("summary"), "summary", 180, max_words=25)
    reported_waste = _required_text(parsed.get("reported_waste"), "reported_waste", 160)
    reported_location = _required_text(parsed.get("reported_location"), "reported_location", 180)
    current_observation = _required_text(
        parsed.get("current_observation"), "current_observation", 280
    )
    key_changes = _bounded_string_list(parsed.get("key_changes"), "key_changes", 2, 220)
    limitations = _bounded_string_list(parsed.get("limitations"), "limitations", 2, 220)
    confidence = _optional_number(parsed.get("confidence"), "confidence", 0, 1)
    cleanup_score = _optional_number(parsed.get("cleanup_score"), "cleanup_score", 0, 100)

    assessment: Assessment = reported_assessment
    if not _is_semantically_consistent(assessment, observable, current_waste_visible):
        assessment = "uncertain"
        response_summary = (
            "The structured result was internally inconsistent and requires human review."
        )
        limitations = [
            *limitations[:1],
            "The structured assessment conflicted with its visibility fields.",
        ]
    if assessment == "appears_cleared" and confidence is None:
        raise HafniaError("Scene-check clearance response is missing numeric confidence")
    if assessment == "appears_cleared" and cleanup_score is None:
        raise HafniaError("Scene-check clearance response is missing numeric cleanup_score")

    return SceneComparison(
        assessment=assessment,
        cleanup_area_observable=observable,
        current_waste_visible=current_waste_visible,
        summary=response_summary,
        reported_waste=reported_waste,
        reported_location=reported_location,
        current_observation=current_observation,
        key_changes=key_changes,
        limitations=limitations,
        confidence=confidence,
        cleanup_score=cleanup_score,
        raw_response=parsed,
        summary_id=summary_result["Id"],
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


def _required_text(value: Any, field: str, max_length: int, *, max_words: int | None = None) -> str:
    if not isinstance(value, str) or not value.strip():
        raise HafniaError(f"Scene-check response is missing {field}")
    text = value.strip()
    if len(text) > max_length or (max_words is not None and len(text.split()) > max_words):
        raise HafniaError(f"Scene-check {field} is too long")
    return text


def _bounded_string_list(value: Any, field: str, max_items: int, max_length: int) -> list[str]:
    if not isinstance(value, list):
        raise HafniaError(f"Scene-check {field} must be an array")
    if len(value) > max_items:
        raise HafniaError(f"Scene-check {field} has too many items")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise HafniaError(f"Scene-check {field} contains an invalid item")
        text = item.strip()
        if len(text) > max_length:
            raise HafniaError(f"Scene-check {field} contains an item that is too long")
        result.append(text)
    return result


def _optional_number(value: Any, field: str, minimum: float, maximum: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HafniaError(f"Scene-check {field} must be numeric when supplied")
    number = float(value)
    if not math.isfinite(number) or not minimum <= number <= maximum:
        raise HafniaError(f"Scene-check {field} must be between {minimum} and {maximum}")
    return number


def _current_waste_visible(value: Any) -> bool | None:
    if value is None or isinstance(value, bool):
        return value
    raise HafniaError("Scene-check current_waste_visible must be true, false, or null")


def _required_bool(value: Any, field: str) -> bool:
    if isinstance(value, bool):
        return value
    raise HafniaError(f"Scene-check response is missing {field}")


def _is_semantically_consistent(
    assessment: Assessment, observable: bool, current_waste_visible: bool | None
) -> bool:
    if assessment == "still_visible":
        return observable and current_waste_visible is True
    if assessment == "appears_cleared":
        return observable and current_waste_visible is False
    return current_waste_visible is None
