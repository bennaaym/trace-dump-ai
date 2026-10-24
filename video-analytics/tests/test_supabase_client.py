from __future__ import annotations

import pytest
import requests

from video_analytics.db.client import SupabaseClient, SupabaseError


class ErrorSession:
    def request(self, *args, **kwargs):
        response = requests.Response()
        response.status_code = 400
        response.url = "https://example.supabase.co/rest/v1/rpc/example"
        response._content = (
            b'{"code":"42804","message":"structure of query does not match function result type",'
            b'"details":"Returned type text does not match expected type uuid.","hint":null}'
        )
        response.request = requests.Request("POST", response.url).prepare()
        return response


def test_postgrest_error_includes_safe_database_diagnostics():
    client = SupabaseClient("https://example.supabase.co", "secret", session=ErrorSession())
    with pytest.raises(SupabaseError) as captured:
        client.request("POST", "/rest/v1/rpc/example", json={})
    message = str(captured.value)
    assert "code=42804" in message
    assert "structure of query does not match function result type" in message
    assert "secret" not in message
