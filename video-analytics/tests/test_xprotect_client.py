from __future__ import annotations

import base64

import pytest
import requests

from video_analytics.xprotect.client import (
    XProtectClient,
    XProtectError,
    build_xprotect_uri,
    parse_camera,
    validate_utc_timestamp,
)


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status_code = status
        self.content = b"{}"

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")


class FakeSession:
    def __init__(self, gets):
        self.gets = list(gets)
        self.posts = 0

    def post(self, *args, **kwargs):
        self.posts += 1
        return FakeResponse({"access_token": f"token-{self.posts}", "expires_in": 3600})

    def get(self, *args, **kwargs):
        return self.gets.pop(0)


def test_camera_metadata_parsing_preserves_supported_and_unknown_fields():
    camera = parse_camera(
        {
            "id": "ABC",
            "name": "vandalism",
            "displayName": "Vandalism",
            "enabled": "False",
            "description": "clip",
            "channel": 3,
            "gisPoint": "POINT (12.3 55.6)",
        }
    )
    assert camera.id == "ABC"
    assert camera.name == "vandalism"
    assert camera.enabled is False
    assert camera.description == "clip"
    assert camera.metadata == {"channel": 3, "gisPoint": "POINT (12.3 55.6)"}


def test_uri_construction_and_utc_validation():
    uri = build_xprotect_uri(
        "C6725C10-958A-4819-A7FC-1FDDAACD2F3E", "2026-10-16T14:45:14Z", "2026-10-16T14:45:28Z"
    )
    assert (
        uri
        == "xprotect://localhost/cameras/C6725C10-958A-4819-A7FC-1FDDAACD2F3E?StartTime=2026-10-16T14:45:14Z&EndTime=2026-10-16T14:45:28Z"
    )
    with pytest.raises(ValueError, match="ISO 8601 UTC"):
        validate_utc_timestamp("2026-10-16T14:45:14+00:00")
    with pytest.raises(ValueError, match="ISO 8601 UTC"):
        validate_utc_timestamp("2026-10-16Z")
    with pytest.raises(ValueError, match="earlier"):
        build_xprotect_uri(
            "C6725C10-958A-4819-A7FC-1FDDAACD2F3E", "2026-10-16T14:45:28Z", "2026-10-16T14:45:14Z"
        )


def test_camera_discovery_includes_disabled_and_parses_pages():
    fake = FakeSession([FakeResponse({"array": [{"id": "one", "name": "A", "enabled": True}]})])
    client = XProtectClient("http://localhost", "user", "pass", session=fake)
    cameras = client.list_cameras(page_size=100)
    assert [camera.name for camera in cameras] == ["A"]


def test_401_refreshes_token_once():
    fake = FakeSession([FakeResponse({}, 401), FakeResponse({"array": []})])
    client = XProtectClient("http://localhost", "user", "pass", session=fake)
    assert client.list_cameras() == []
    assert fake.posts == 2


def test_http_error_is_wrapped():
    fake = FakeSession([FakeResponse({}, 500)])
    client = XProtectClient("http://localhost", "user", "pass", session=fake)
    with pytest.raises(XProtectError, match="failed"):
        client.list_cameras()


def test_get_live_jpeg_uses_documented_camera_task():
    jpeg = b"\xff\xd8mock\xff\xd9"

    class LiveSession:
        def __init__(self):
            self.calls = []

        def post(self, url, **kwargs):
            self.calls.append((url, kwargs))
            if url.endswith("/API/IDP/connect/token"):
                return FakeResponse({"access_token": "token", "expires_in": 3600})
            return FakeResponse(
                {
                    "result": {
                        "frameDateTime": "2026-10-16T22:10:49.243Z",
                        "jpegDataAsBase64": base64.b64encode(jpeg).decode("ascii"),
                        "state": "Success",
                    }
                }
            )

    session = LiveSession()
    client = XProtectClient("http://localhost", "user", "pass", session=session)
    result = client.get_live_jpeg("baaba7e1-7e9d-4732-8f46-6612ffc9df1e", width=640, height=360)

    assert result.jpeg_bytes == jpeg
    assert result.frame_datetime == "2026-10-16T22:10:49.243Z"
    url, request = session.calls[-1]
    assert url.endswith(
        "/api/rest/v1/cameras/baaba7e1-7e9d-4732-8f46-6612ffc9df1e?task=JpegGetLive"
    )
    assert request["json"] == {"width": 640, "height": 360}
