"""Small server-only Supabase REST and Storage client."""

from __future__ import annotations

from typing import Any

import requests


class SupabaseError(RuntimeError):
    """A Supabase REST or Storage request failed."""


class SupabaseClient:
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
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or requests.Session()
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: Any = None,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        raw: bool = False,
    ) -> Any:
        request_headers = {**self.headers, **(headers or {})}
        try:
            response = self.session.request(
                method,
                f"{self.base_url}{path}",
                headers=request_headers,
                params=params,
                json=json,
                data=data,
                timeout=self.timeout,
            )
            response.raise_for_status()
            if raw:
                return response.content
            return response.json() if response.content else None
        except (requests.RequestException, ValueError) as exc:
            raise SupabaseError(f"Supabase {method} {path} failed: {exc}") from exc
