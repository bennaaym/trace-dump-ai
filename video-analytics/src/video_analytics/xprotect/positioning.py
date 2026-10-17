"""Parse camera positioning metadata returned by XProtect."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Literal

from video_analytics.models import Camera

CoordinateState = Literal["valid", "missing", "invalid", "unavailable"]

_POINT_RE = re.compile(
    r"^POINT(?:\s+(?:Z|M|ZM))?\s*\(\s*"
    r"([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s+"
    r"([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"
    r"(?:\s+[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)?\s*\)$",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class CameraPosition:
    """Validated longitude/latitude plus the state of metadata retrieval."""

    latitude: float | None
    longitude: float | None
    state: CoordinateState
    raw: Any = None
    reason: str | None = None


def parse_camera_position(camera: Camera) -> CameraPosition:
    """Parse documented ``gisPoint`` WKT in longitude/latitude order."""

    if "gisPoint" not in camera.metadata:
        return CameraPosition(None, None, "unavailable", reason="gisPoint field was not returned")

    raw = camera.metadata["gisPoint"]
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return CameraPosition(None, None, "missing", raw=raw, reason="gisPoint is empty")
    if not isinstance(raw, str):
        return CameraPosition(None, None, "invalid", raw=raw, reason="gisPoint is not text")

    value = raw.strip()
    if re.fullmatch(r"POINT\s+EMPTY", value, re.IGNORECASE):
        return CameraPosition(
            None, None, "missing", raw=raw, reason="XProtect returned POINT EMPTY"
        )

    match = _POINT_RE.fullmatch(value)
    if not match:
        return CameraPosition(
            None, None, "invalid", raw=raw, reason="gisPoint is not valid POINT WKT"
        )

    longitude, latitude = (float(part) for part in match.groups())
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return CameraPosition(None, None, "invalid", raw=raw, reason="coordinates are not finite")
    if not -90 <= latitude <= 90:
        return CameraPosition(
            None, None, "invalid", raw=raw, reason="latitude is outside [-90, 90]"
        )
    if not -180 <= longitude <= 180:
        return CameraPosition(
            None, None, "invalid", raw=raw, reason="longitude is outside [-180, 180]"
        )
    return CameraPosition(latitude, longitude, "valid", raw=raw)
