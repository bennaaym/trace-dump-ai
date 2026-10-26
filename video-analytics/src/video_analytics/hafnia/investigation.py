"""Validate structured Hafnia observations without inventing model findings."""

from __future__ import annotations

import json
import math
import re
from typing import Any

_TIMESTAMP_RESOLUTION_SECONDS = 0.5


def structured_response(text: str, duration: float | None = None) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```json") and cleaned.endswith("```"):
        cleaned = cleaned[7:-3].strip()
    try:
        value = json.loads(cleaned)
    except (ValueError, TypeError):
        return None
    if not isinstance(value, dict) or value.get("schema_version") != "investigation_v1":
        return None
    observations = []
    seen = set()
    seen_claims: set[str] = set()
    accepted_offsets: list[float] = []
    for item in (
        value.get("observations", [])[:12] if isinstance(value.get("observations"), list) else []
    ):
        if not isinstance(item, dict):
            continue
        identifier, claim, offset = item.get("id"), item.get("claim"), item.get("offset_seconds")
        if (
            not isinstance(identifier, str)
            or len(identifier) > 64
            or not identifier.isascii()
            or not identifier.replace("-", "").replace("_", "").isalnum()
            or identifier in seen
        ):
            continue
        if not isinstance(claim, str) or not claim.strip():
            continue
        normalized_claim = re.sub(r"[^a-z0-9]+", " ", claim.lower()).strip()
        if normalized_claim in seen_claims:
            continue
        seen.add(identifier)
        seen_claims.add(normalized_claim)
        valid = (
            isinstance(offset, (int, float))
            and not isinstance(offset, bool)
            and math.isfinite(offset)
            and item.get("timing_basis") != "unknown"
            and offset >= 0
            and (duration is None or offset < duration)
        )
        if valid and any(
            abs(float(offset) - accepted) < _TIMESTAMP_RESOLUTION_SECONDS
            for accepted in accepted_offsets
        ):
            valid = False
        if valid:
            accepted_offsets.append(float(offset))
        observations.append(
            {
                "id": identifier[:64],
                "claim": claim.strip()[:2000],
                "offset_seconds": offset if valid else None,
            }
        )
    observations.sort(
        key=lambda item: (item["offset_seconds"] is None, item["offset_seconds"] or 0)
    )
    return {**value, "observations": observations}


def response_text(value: Any, depth: int = 0) -> str | None:
    """Preserve supplied narrative fields when a model returns arrays instead of strings."""
    if isinstance(value, str):
        return value.strip()[:8000] or None
    if depth >= 2:
        return None
    if isinstance(value, list):
        parts = [response_text(item, depth + 1) for item in value[:12]]
    elif isinstance(value, dict):
        parts = [
            response_text(value.get(key), depth + 1)
            for key in ("description", "actions", "state", "evidence", "limitations")
        ]
    else:
        return None
    return "\n".join(part for part in parts if part)[:8000] or None


def event_reference_matches(value: dict[str, Any]) -> bool:
    reference = value.get("event_observation_id")
    offset = value.get("event_offset_seconds")
    if (
        not isinstance(reference, str)
        or not isinstance(offset, (float, int))
        or isinstance(offset, bool)
    ):
        return False
    for observation in value["observations"]:
        time = observation["offset_seconds"]
        if observation["id"] == reference and time is not None:
            return math.isfinite(offset) and abs(time - offset) < 0.001
    return False
