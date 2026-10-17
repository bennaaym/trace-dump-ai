"""Read-only XProtect authentication and camera discovery client."""

from __future__ import annotations

import re
import time
import uuid
from base64 import b64decode
from binascii import Error as Base64Error
from datetime import UTC, datetime
from typing import Any

import requests

from ..models import Camera, XProtectJpeg


class XProtectError(RuntimeError):
    """An XProtect request or response was invalid."""


_UTC_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")


def _optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value.lower() == "true":
            return True
        if value.lower() == "false":
            return False
    return None


def parse_camera(raw: dict[str, Any]) -> Camera:
    camera_id = raw.get("id")
    name = raw.get("name") or raw.get("displayName")
    if not isinstance(camera_id, str) or not camera_id.strip():
        raise XProtectError("Camera response is missing a valid id")
    if not isinstance(name, str) or not name.strip():
        raise XProtectError(f"Camera {camera_id} is missing a valid name")
    known = {"id", "name", "enabled", "displayName", "description", "lastModified"}
    return Camera(
        id=camera_id,
        name=name,
        enabled=_optional_bool(raw.get("enabled")),
        display_name=raw.get("displayName") if isinstance(raw.get("displayName"), str) else None,
        description=raw.get("description") if isinstance(raw.get("description"), str) else None,
        last_modified=raw.get("lastModified") if isinstance(raw.get("lastModified"), str) else None,
        metadata={key: value for key, value in raw.items() if key not in known},
    )


def validate_utc_timestamp(value: str) -> datetime:
    if not isinstance(value, str) or not _UTC_PATTERN.fullmatch(value):
        raise ValueError("Timestamp must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS[.ffffff]Z)")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValueError(f"Invalid UTC timestamp: {value}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != UTC.utcoffset(parsed):
        raise ValueError("Timestamp must be UTC")
    return parsed


def _canonical_utc(value: str) -> str:
    parsed = validate_utc_timestamp(value).astimezone(UTC)
    if parsed.microsecond:
        return parsed.isoformat(timespec="microseconds").replace("+00:00", "Z")
    return parsed.isoformat(timespec="seconds").replace("+00:00", "Z")


def build_xprotect_uri(camera_id: str, start: str, end: str) -> str:
    try:
        parsed_id = uuid.UUID(camera_id)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError(f"Invalid camera GUID: {camera_id}") from exc
    if str(parsed_id).casefold() != camera_id.casefold():
        raise ValueError(f"Invalid camera GUID: {camera_id}")
    start_dt = validate_utc_timestamp(start)
    end_dt = validate_utc_timestamp(end)
    if start_dt >= end_dt:
        raise ValueError("Recording start must be earlier than end")
    query = f"StartTime={_canonical_utc(start)}&EndTime={_canonical_utc(end)}"
    return f"xprotect://localhost/cameras/{camera_id}?{query}"


class XProtectClient:
    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        *,
        timeout: float = 60.0,
        session: requests.Session | None = None,
    ) -> None:
        if not username or not password:
            raise ValueError("XProtect username and password are required")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self._password = password
        self.timeout = timeout
        self.session = session or requests.Session()
        self._token: str | None = None
        self._token_expires_at = 0.0

    def _login(self) -> None:
        try:
            response = self.session.post(
                f"{self.base_url}/API/IDP/connect/token",
                data={
                    "grant_type": "password",
                    "username": self.username,
                    "password": self._password,
                    "client_id": "GrantValidatorClient",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise XProtectError(f"XProtect login failed: {exc}") from exc
        token = payload.get("access_token")
        if not isinstance(token, str) or not token:
            raise XProtectError("XProtect login response did not contain access_token")
        try:
            expires_in = max(1.0, float(payload.get("expires_in", 300)))
        except (TypeError, ValueError):
            expires_in = 300.0
        self._token = token
        self._token_expires_at = time.monotonic() + max(1.0, expires_in - 30.0)

    def _ensure_token(self) -> None:
        if self._token is None or time.monotonic() >= self._token_expires_at:
            self._login()

    def _get(self, path: str, *, retry_auth: bool = True) -> Any:
        self._ensure_token()
        try:
            response = self.session.get(
                f"{self.base_url}/api/rest/v1{path}",
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=self.timeout,
            )
            if response.status_code == 401 and retry_auth:
                self._token = None
                return self._get(path, retry_auth=False)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            raise XProtectError(f"XProtect GET {path} failed: {exc}") from exc

    def _post(self, path: str, payload: dict[str, Any], *, retry_auth: bool = True) -> Any:
        self._ensure_token()
        try:
            response = self.session.post(
                f"{self.base_url}/api/rest/v1{path}",
                headers={"Authorization": f"Bearer {self._token}"},
                json=payload,
                timeout=self.timeout,
            )
            if response.status_code == 401 and retry_auth:
                self._token = None
                return self._post(path, payload, retry_auth=False)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            raise XProtectError(f"XProtect POST {path} failed: {exc}") from exc

    def list_cameras(self, *, include_disabled: bool = True, page_size: int = 100) -> list[Camera]:
        if page_size < 1:
            raise ValueError("page_size must be positive")
        cameras: list[Camera] = []
        page = 0
        while True:
            suffix = "&disabled" if include_disabled else ""
            payload = self._get(f"/cameras?page={page}&size={page_size}{suffix}")
            raw_items = payload.get("array") if isinstance(payload, dict) else None
            if not isinstance(raw_items, list):
                raise XProtectError("Camera response did not contain an array")
            cameras.extend(parse_camera(item) for item in raw_items if isinstance(item, dict))
            if len(raw_items) < page_size:
                break
            page += 1
        return cameras

    def get_live_jpeg(
        self, camera_id: str, *, width: int = 1280, height: int = 720
    ) -> XProtectJpeg:
        """Retrieve one live JPEG through the documented JpegGetLive camera task."""
        try:
            canonical_id = str(uuid.UUID(camera_id))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError(f"Invalid camera GUID: {camera_id}") from exc
        if width < 1 or height < 1:
            raise ValueError("JPEG width and height must be positive")
        payload = self._post(
            f"/cameras/{canonical_id}?task=JpegGetLive",
            {"width": width, "height": height},
        )
        result = payload.get("result") if isinstance(payload, dict) else None
        if not isinstance(result, dict) or result.get("state") != "Success":
            raise XProtectError("JpegGetLive did not return a successful result")
        timestamp = result.get("frameDateTime")
        encoded = result.get("jpegDataAsBase64")
        if not isinstance(timestamp, str) or not timestamp:
            raise XProtectError("JpegGetLive response is missing frameDateTime")
        if not isinstance(encoded, str) or not encoded:
            raise XProtectError("JpegGetLive response is missing jpegDataAsBase64")
        try:
            data = b64decode(encoded, validate=True)
        except (Base64Error, ValueError) as exc:
            raise XProtectError("JpegGetLive returned invalid base64 JPEG data") from exc
        return XProtectJpeg(camera_id=canonical_id, frame_datetime=timestamp, jpeg_bytes=data)
