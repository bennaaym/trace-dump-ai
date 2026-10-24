"""Backend adapters for changing a camera's controlled upstream scene."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from urllib.parse import quote
from uuid import UUID

import requests


class SceneSourceError(RuntimeError):
    """The configured upstream provider could not switch or verify a source."""


@dataclass(frozen=True, slots=True)
class SceneSourceState:
    source_reference: str | None
    ready: bool
    generation: str | None = None
    capture_camera_id: str | None = None


class SceneSourceAdapter(Protocol):
    name: str

    def switch(self, camera_id: str, source_type: str, source_reference: str) -> None: ...

    def state(self, camera_id: str) -> SceneSourceState: ...


class UnavailableSceneSourceAdapter:
    name = "unavailable"

    def switch(self, camera_id: str, source_type: str, source_reference: str) -> None:
        raise SceneSourceError(
            "No scene-source backend is configured. The installed StableFPS driver has no "
            "verified runtime clip-switch API; configure SCENE_SOURCE_ADAPTER=http only after "
            "deploying an approved upstream controller."
        )

    def state(self, camera_id: str) -> SceneSourceState:
        return SceneSourceState(source_reference=None, ready=False)


class MappedXProtectCameraSceneAdapter:
    """Select a dedicated XProtect fixture camera without changing VMS configuration."""

    name = "xprotect_camera"

    def __init__(self) -> None:
        self._states: dict[str, SceneSourceState] = {}

    def switch(self, camera_id: str, source_type: str, source_reference: str) -> None:
        if source_type != "xprotect_camera":
            raise SceneSourceError("Mapped-camera adapter requires source_type=xprotect_camera")
        try:
            capture_camera_id = str(UUID(source_reference))
        except ValueError as exc:
            raise SceneSourceError("Mapped-camera source reference must be a camera GUID") from exc
        self._states[camera_id] = SceneSourceState(
            source_reference=capture_camera_id,
            ready=True,
            generation=f"xprotect-camera:{capture_camera_id}",
            capture_camera_id=capture_camera_id,
        )

    def state(self, camera_id: str) -> SceneSourceState:
        return self._states.get(camera_id, SceneSourceState(None, False))


class HttpSceneSourceAdapter:
    """Small private contract implemented by a native XProtect or RTSP controller."""

    name = "http"

    def __init__(self, base_url: str, token: str, *, timeout: float = 15.0) -> None:
        if not base_url.strip() or not token.strip():
            raise ValueError("HTTP scene-source adapter requires its URL and token")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    def switch(self, camera_id: str, source_type: str, source_reference: str) -> None:
        try:
            response = requests.post(
                f"{self.base_url}/v1/cameras/{quote(camera_id, safe='')}/scene",
                headers=self.headers,
                json={"source_type": source_type, "source_reference": source_reference},
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise SceneSourceError(f"Scene-source switch request failed: {exc}") from exc

    def state(self, camera_id: str) -> SceneSourceState:
        try:
            response = requests.get(
                f"{self.base_url}/v1/cameras/{quote(camera_id, safe='')}/scene",
                headers=self.headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise SceneSourceError(f"Scene-source readiness request failed: {exc}") from exc
        reference = payload.get("source_reference")
        ready = payload.get("ready")
        if reference is not None and not isinstance(reference, str):
            raise SceneSourceError("Scene-source backend returned an invalid source_reference")
        if not isinstance(ready, bool):
            raise SceneSourceError("Scene-source backend returned an invalid ready value")
        generation = payload.get("generation")
        capture_camera_id = payload.get("capture_camera_id")
        return SceneSourceState(
            source_reference=reference,
            ready=ready,
            generation=generation if isinstance(generation, str) else None,
            capture_camera_id=(capture_camera_id if isinstance(capture_camera_id, str) else None),
        )


def create_scene_source_adapter(
    adapter_name: str, control_url: str | None, control_token: str | None
) -> SceneSourceAdapter:
    normalized = adapter_name.strip().lower()
    if normalized == "unavailable":
        return UnavailableSceneSourceAdapter()
    if normalized == "http":
        return HttpSceneSourceAdapter(control_url or "", control_token or "")
    if normalized == "xprotect_camera":
        return MappedXProtectCameraSceneAdapter()
    raise ValueError(f"Unsupported SCENE_SOURCE_ADAPTER: {adapter_name}")
