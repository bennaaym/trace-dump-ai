from __future__ import annotations

from pathlib import Path

from video_analytics.db.client import SupabaseError
from video_analytics.db.persistence import (
    PendingSyncStore,
    SupabaseAnalysisRepository,
    insert_operation,
    stable_id,
    upload_operation,
)


class FakeClient:
    def __init__(self, failures: int = 0) -> None:
        self.failures = failures
        self.calls: list[tuple[str, str, dict]] = []

    def request(self, method: str, path: str, **kwargs):
        if self.failures:
            self.failures -= 1
            raise SupabaseError("synthetic temporary outage")
        self.calls.append((method, path, kwargs))
        return None


def test_pending_operations_survive_failure_and_retry_in_order(tmp_path: Path):
    outbox = PendingSyncStore(tmp_path / "pending.json")
    client = FakeClient(failures=1)
    repository = SupabaseAnalysisRepository(client, outbox)
    detection_id = stable_id("detection", "synthetic-run", "camera", "session")
    repository.queue(insert_operation("detections", {"id": detection_id, "camera_id": "camera"}))

    first = repository.flush()
    assert first["synced"] == 0
    assert first["pending"] == 1
    assert outbox.path.is_file()

    second = repository.flush()
    assert second == {"synced": 1, "pending": 0, "error": None}
    assert client.calls[0][0:2] == ("POST", "/rest/v1/detections")


def test_storage_upload_reads_preserved_local_frame(tmp_path: Path):
    frame = tmp_path / "event.jpg"
    frame.write_bytes(b"synthetic-jpeg")
    client = FakeClient()
    repository = SupabaseAnalysisRepository(client, PendingSyncStore(tmp_path / "pending.json"))
    repository.queue(upload_operation("incidents/incident-id/event.jpg", str(frame)))

    assert repository.flush()["pending"] == 0
    _, path, kwargs = client.calls[0]
    assert path == "/storage/v1/object/incident-evidence/incidents/incident-id/event.jpg"
    assert kwargs["data"] == b"synthetic-jpeg"
    assert kwargs["headers"]["x-upsert"] == "true"


def test_stable_ids_make_repeated_simulation_records_identical():
    first = stable_id("analysis", "run-1", "camera-1", "session-1")
    second = stable_id("analysis", "run-1", "camera-1", "session-1")
    assert first == second
