"""Durable, ordered persistence of analysis results to Supabase."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import quote

from .client import SupabaseClient, SupabaseError

logger = logging.getLogger(__name__)
ID_NAMESPACE = uuid.UUID("30a74167-63aa-4ee7-b2ad-dba0d5ea4f83")


def stable_id(kind: str, *parts: str) -> str:
    return str(uuid.uuid5(ID_NAMESPACE, "\x1f".join((kind, *parts))))


def occurred_at(recording_start: str, offset_seconds: float | None) -> str | None:
    if offset_seconds is None:
        return None
    start = datetime.fromisoformat(recording_start.replace("Z", "+00:00")).astimezone(UTC)
    return (
        (start + timedelta(seconds=offset_seconds))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


class AnalysisRepository(Protocol):
    def queue(self, operation: dict[str, Any]) -> None: ...

    def flush(self) -> dict[str, Any]: ...


class PendingSyncStore:
    """Append-before-send outbox; successful operations are removed atomically."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock_path = path.with_suffix(path.suffix + ".lock")

    @contextmanager
    def locked(self, timeout: float = 10.0):
        deadline = time.monotonic() + timeout
        self.path.parent.mkdir(parents=True, exist_ok=True)
        while True:
            try:
                descriptor = os.open(self.lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(descriptor)
                break
            except FileExistsError:
                if time.monotonic() >= deadline:
                    raise RuntimeError(f"Timed out locking Supabase outbox: {self.path}") from None
                time.sleep(0.05)
        try:
            yield
        finally:
            self.lock_path.unlink(missing_ok=True)

    def _read(self) -> list[dict[str, Any]]:
        if not self.path.is_file():
            return []
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, list) else []

    def _write(self, operations: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle, temporary = tempfile.mkstemp(prefix=f".{self.path.name}.", dir=self.path.parent)
        try:
            with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
                json.dump(operations, stream, indent=2, ensure_ascii=False)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def append(self, operation: dict[str, Any]) -> None:
        with self.locked():
            operations = self._read()
            key = operation["key"]
            if not any(item.get("key") == key for item in operations):
                operations.append(operation)
                self._write(operations)

    def pending(self) -> list[dict[str, Any]]:
        with self.locked():
            return self._read()


class SupabaseAnalysisRepository:
    """Idempotent PostgREST/Storage writer backed by a durable local outbox."""

    def __init__(self, client: SupabaseClient, outbox: PendingSyncStore) -> None:
        self.client = client
        self.outbox = outbox

    def queue(self, operation: dict[str, Any]) -> None:
        self.outbox.append(operation)

    def flush(self) -> dict[str, Any]:
        synced = 0
        error: str | None = None
        with self.outbox.locked():
            operations = self.outbox._read()
            while operations:
                operation = operations[0]
                try:
                    self._execute(operation)
                except (SupabaseError, OSError) as exc:
                    error = str(exc)
                    logger.warning("supabase_sync_deferred key=%s error=%s", operation["key"], exc)
                    break
                operations.pop(0)
                self.outbox._write(operations)
                synced += 1
        return {"synced": synced, "pending": len(operations), "error": error}

    def _execute(self, operation: dict[str, Any]) -> None:
        kind = operation["kind"]
        if kind == "insert":
            self.client.request(
                "POST",
                f"/rest/v1/{operation['table']}",
                params={"on_conflict": "id"},
                json=operation["values"],
                headers={"Prefer": "resolution=ignore-duplicates,return=minimal"},
            )
            return
        if kind == "update":
            self.client.request(
                "PATCH",
                f"/rest/v1/{operation['table']}",
                params={"id": f"eq.{operation['id']}"},
                json=operation["values"],
                headers={"Prefer": "return=minimal"},
            )
            return
        if kind == "upload":
            path = Path(operation["local_path"])
            data = path.read_bytes()
            self.client.request(
                "POST",
                "/storage/v1/object/incident-evidence/"
                + quote(operation["storage_path"], safe="/"),
                data=data,
                headers={"Content-Type": "image/jpeg", "x-upsert": "true"},
            )
            return
        raise ValueError(f"Unknown pending synchronization operation: {kind}")


def insert_operation(table: str, values: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": f"insert:{table}:{values['id']}",
        "kind": "insert",
        "table": table,
        "values": values,
    }


def update_operation(
    table: str, record_id: str, stage: str, values: dict[str, Any]
) -> dict[str, Any]:
    return {
        "key": f"update:{table}:{record_id}:{stage}",
        "kind": "update",
        "table": table,
        "id": record_id,
        "values": values,
    }


def upload_operation(storage_path: str, local_path: str) -> dict[str, Any]:
    return {
        "key": f"upload:{storage_path}",
        "kind": "upload",
        "storage_path": storage_path,
        "local_path": local_path,
    }
