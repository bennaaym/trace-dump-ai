"""Idempotent synchronization of XProtect camera metadata to Supabase."""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from dataclasses import asdict, dataclass
from typing import Any, Protocol

import requests

from video_analytics.models import Camera
from video_analytics.xprotect.positioning import CameraPosition, parse_camera_position

logger = logging.getLogger(__name__)

_ENABLED_LOCATIONS = frozenset(
    {"chartrons", "bacalan", "bastide", "saint michel", "jardin public", "talence"}
)
_DISABLED_LOCATIONS = frozenset({"meriadeck", "nansouty", "cauderan"})
_SELECT_FIELDS = "id,name,latitude,longitude,location_source,enabled,status"


class CameraSyncError(RuntimeError):
    """Raised when Supabase camera persistence fails."""


class CameraRepository(Protocol):
    def list_cameras(self) -> list[dict[str, Any]]: ...

    def upsert_camera(self, values: dict[str, Any]) -> None: ...


@dataclass(frozen=True, slots=True)
class CameraSyncResult:
    id: str
    name: str
    latitude: float | None
    longitude: float | None
    coordinate_state: str
    enabled: bool | None
    action: str
    committed: bool
    error: str | None = None


@dataclass(frozen=True, slots=True)
class CameraSyncReport:
    dry_run: bool
    discovered: int
    results: tuple[CameraSyncResult, ...]

    @property
    def counts(self) -> dict[str, int]:
        return {
            action: sum(result.action == action for result in self.results)
            for action in ("inserted", "updated", "unchanged", "failed")
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "discovered": self.discovered,
            "counts": self.counts,
            "duplicates": self.discovered - len({result.id for result in self.results}),
            "results": [asdict(result) for result in self.results],
        }


class SupabaseCameraRepository:
    """Minimal PostgREST client using a server-only Supabase service-role key."""

    def __init__(
        self,
        base_url: str,
        service_role_key: str,
        *,
        timeout: float = 60.0,
        session: requests.Session | None = None,
    ) -> None:
        if not base_url.strip():
            raise ValueError("SUPABASE_URL is required")
        if not service_role_key.strip():
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required")
        self._url = f"{base_url.rstrip('/')}/rest/v1/cameras"
        self._timeout = timeout
        self._session = session or requests.Session()
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def list_cameras(self) -> list[dict[str, Any]]:
        try:
            response = self._session.get(
                self._url,
                headers=self._headers,
                params={"select": _SELECT_FIELDS},
                timeout=self._timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise CameraSyncError(f"Supabase camera read failed: {exc}") from exc
        if not isinstance(payload, list):
            raise CameraSyncError("Supabase camera read returned an unexpected payload")
        return payload

    def upsert_camera(self, values: dict[str, Any]) -> None:
        headers = {**self._headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
        try:
            response = self._session.post(
                self._url,
                headers=headers,
                params={"on_conflict": "id"},
                json=values,
                timeout=self._timeout,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise CameraSyncError(f"Supabase camera upsert failed: {exc}") from exc


def _canonical_guid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError(f"invalid XProtect camera GUID: {value!r}") from exc


def _normalized_name(value: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return " ".join(part for part in re.split(r"[^a-z0-9]+", ascii_name.casefold()) if part)


def initial_enabled(name: str) -> bool:
    """Return the demo default without interpreting DYN/STA/NOR labels."""

    normalized = _normalized_name(name)
    if any(
        normalized == location or normalized.endswith(f" {location}")
        for location in _ENABLED_LOCATIONS
    ):
        return True
    if any(
        normalized == location or normalized.endswith(f" {location}")
        for location in _DISABLED_LOCATIONS
    ):
        return False
    logger.warning("camera_monitoring_default_unknown camera_name=%s enabled=false", name)
    return False


def _position_values(position: CameraPosition) -> dict[str, Any]:
    return {
        "latitude": position.latitude,
        "longitude": position.longitude,
        "location_source": "simulated",
    }


def _changed(existing: dict[str, Any], values: dict[str, Any]) -> bool:
    return any(existing.get(key) != value for key, value in values.items() if key != "id")


def sync_cameras(
    cameras: list[Camera], repository: CameraRepository, *, dry_run: bool = False
) -> CameraSyncReport:
    """Synchronize cameras without deleting absent rows or overwriting app state."""

    existing_rows = repository.list_cameras()
    existing_by_id = {str(row["id"]).casefold(): row for row in existing_rows}
    results: list[CameraSyncResult] = []
    seen: set[str] = set()

    for camera in cameras:
        try:
            camera_id = _canonical_guid(camera.id)
        except ValueError as exc:
            logger.warning(
                "camera_sync_invalid_guid camera_id=%s camera_name=%s", camera.id, camera.name
            )
            results.append(
                CameraSyncResult(
                    camera.id,
                    camera.display_name or camera.name,
                    None,
                    None,
                    "unavailable",
                    None,
                    "failed",
                    False,
                    str(exc),
                )
            )
            continue

        name = (camera.display_name or camera.name).strip()
        position = parse_camera_position(camera)
        if position.state != "valid":
            logger.warning(
                "camera_coordinates_%s camera_id=%s camera_name=%s reason=%s",
                position.state,
                camera_id,
                name,
                position.reason,
            )
        if camera_id in seen:
            error = "duplicate GUID returned by XProtect discovery"
            logger.warning("camera_sync_duplicate camera_id=%s camera_name=%s", camera_id, name)
            results.append(
                CameraSyncResult(
                    camera_id,
                    name,
                    position.latitude,
                    position.longitude,
                    position.state,
                    None,
                    "failed",
                    False,
                    error,
                )
            )
            continue
        seen.add(camera_id)

        existing = existing_by_id.get(camera_id)
        values: dict[str, Any] = {"id": camera_id, "name": name}
        if existing is None:
            values.update(_position_values(position))
            values.update({"enabled": initial_enabled(name), "status": "unknown"})
            action = "inserted"
            enabled = values["enabled"]
        else:
            enabled = bool(existing["enabled"])
            values.update(
                {
                    "latitude": existing.get("latitude"),
                    "longitude": existing.get("longitude"),
                    "location_source": existing["location_source"],
                    "enabled": enabled,
                    "status": existing["status"],
                }
            )
            if position.state != "unavailable":
                values.update(_position_values(position))
            action = "updated" if _changed(existing, values) else "unchanged"

        committed = False
        error: str | None = None
        if action != "unchanged" and not dry_run:
            try:
                repository.upsert_camera(values)
                committed = True
            except (CameraSyncError, requests.RequestException, ValueError) as exc:
                action = "failed"
                error = str(exc)
                logger.warning("camera_sync_failed camera_id=%s error=%s", camera_id, exc)

        results.append(
            CameraSyncResult(
                camera_id,
                name,
                position.latitude,
                position.longitude,
                position.state,
                enabled,
                action,
                committed,
                error,
            )
        )

    return CameraSyncReport(dry_run, len(cameras), tuple(results))
