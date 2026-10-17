"""Shared data models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class Camera:
    """A camera returned by the XProtect Configuration REST API."""

    id: str
    name: str
    enabled: bool | None = None
    display_name: str | None = None
    description: str | None = None
    last_modified: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict, repr=False, compare=False)


@dataclass(frozen=True, slots=True)
class XProtectJpeg:
    """One JPEG returned by an XProtect camera task."""

    camera_id: str
    frame_datetime: str
    jpeg_bytes: bytes = field(repr=False, compare=False)
