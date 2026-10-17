from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest

from video_analytics.db.cameras import initial_enabled, sync_cameras
from video_analytics.models import Camera
from video_analytics.xprotect.positioning import parse_camera_position

CAMERAS = (
    ("baaba7e1-7e9d-4732-8f46-6612ffc9df1e", "TD-DYN-01-Chartrons", True),
    ("acf158af-1b1e-4b23-9d83-2e4ec99b482a", "TD-DYN-02-Bacalan", True),
    ("cbb8ed37-1bc4-458f-9b66-d71f8ddc7206", "TD-DYN-03-Bastide", True),
    ("812e48f3-a6b9-4ed9-8945-e4608a45aec8", "TD-NOR-01-Jardin-Public", True),
    ("b1e071d6-4f8c-420d-b219-5b2fadd5a990", "TD-NOR-02-Meriadeck", False),
    ("70f7ca39-3994-4a84-87fc-7cca9f271b81", "TD-NOR-03-Talence", True),
    ("8ed99590-d873-43ab-aeb1-e49c9886e0e4", "TD-STA-01-Saint-Michel", True),
    ("010ef8b7-d0c9-4687-9e35-1e2663d3cd08", "TD-STA-02-Nansouty", False),
    ("1d8c6901-dd1d-44bd-b35b-00750e564f1d", "TD-STA-03-Cauderan", False),
)


class MemoryRepository:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = {row["id"]: deepcopy(row) for row in (rows or [])}
        self.writes: list[dict[str, Any]] = []

    def list_cameras(self) -> list[dict[str, Any]]:
        return list(deepcopy(self.rows).values())

    def upsert_camera(self, values: dict[str, Any]) -> None:
        self.writes.append(deepcopy(values))
        defaults = {
            "latitude": None,
            "longitude": None,
            "location_source": "simulated",
            "enabled": False,
            "status": "unknown",
        }
        row = {**defaults, **self.rows.get(values["id"], {}), **values}
        self.rows[values["id"]] = row


def make_camera(camera_id: str, name: str, gis_point: Any = "POINT (-0.57 44.84)") -> Camera:
    return Camera(camera_id, name, display_name=name, metadata={"gisPoint": gis_point})


@pytest.mark.parametrize(
    ("value", "state", "latitude", "longitude"),
    [
        ("POINT (-0.5738 44.8542)", "valid", 44.8542, -0.5738),
        ("POINT Z (-0.5738 44.8542 15)", "valid", 44.8542, -0.5738),
        ("POINT EMPTY", "missing", None, None),
        ("POINT (-181 44)", "invalid", None, None),
        ("POINT (-0.5 91)", "invalid", None, None),
        ("not a point", "invalid", None, None),
    ],
)
def test_gis_point_parsing_and_ranges(value, state, latitude, longitude):
    position = parse_camera_position(make_camera(CAMERAS[0][0], CAMERAS[0][1], value))
    assert (position.state, position.latitude, position.longitude) == (state, latitude, longitude)


def test_absent_gis_point_is_unavailable_not_missing():
    position = parse_camera_position(Camera(CAMERAS[0][0], CAMERAS[0][1]))
    assert position.state == "unavailable"


def test_all_nine_initial_defaults_ignore_camera_class_labels():
    assert [(name, initial_enabled(name)) for _, name, _ in CAMERAS] == [
        (name, expected) for _, name, expected in CAMERAS
    ]
    assert initial_enabled("TD-DYN-99-Unknown") is False


def test_dry_run_reports_nine_inserts_without_writing():
    repository = MemoryRepository()
    cameras = [make_camera(camera_id, name) for camera_id, name, _ in CAMERAS]

    report = sync_cameras(cameras, repository, dry_run=True)

    assert report.discovered == 9
    assert report.counts == {"inserted": 9, "updated": 0, "unchanged": 0, "failed": 0}
    assert repository.writes == []
    assert [result.enabled for result in report.results].count(True) == 6
    assert [result.enabled for result in report.results].count(False) == 3


def test_sync_is_idempotent_and_preserves_enabled_and_status():
    repository = MemoryRepository()
    cameras = [make_camera(camera_id, name) for camera_id, name, _ in CAMERAS]
    first = sync_cameras(cameras, repository)
    assert first.counts["inserted"] == 9
    assert len(repository.rows) == 9

    camera_id = CAMERAS[0][0]
    repository.rows[camera_id]["enabled"] = False
    repository.rows[camera_id]["status"] = "online"
    repository.writes.clear()
    second = sync_cameras(cameras, repository)

    assert second.counts == {"inserted": 0, "updated": 0, "unchanged": 9, "failed": 0}
    assert repository.writes == []
    assert repository.rows[camera_id]["enabled"] is False
    assert repository.rows[camera_id]["status"] == "online"


def test_unavailable_position_preserves_existing_coordinates():
    camera_id, name, _ = CAMERAS[0]
    repository = MemoryRepository(
        [
            {
                "id": camera_id,
                "name": name,
                "latitude": 44.8542,
                "longitude": -0.5738,
                "location_source": "simulated",
                "enabled": True,
                "status": "unknown",
            }
        ]
    )

    report = sync_cameras([Camera(camera_id, name)], repository)

    assert report.results[0].coordinate_state == "unavailable"
    assert report.results[0].action == "unchanged"
    assert repository.rows[camera_id]["latitude"] == 44.8542
    assert repository.rows[camera_id]["longitude"] == -0.5738


def test_coordinate_update_preserves_manual_monitoring_and_status():
    camera_id, name, _ = CAMERAS[0]
    repository = MemoryRepository(
        [
            {
                "id": camera_id,
                "name": name,
                "latitude": 44.0,
                "longitude": -1.0,
                "location_source": "simulated",
                "enabled": False,
                "status": "online",
            }
        ]
    )

    report = sync_cameras([make_camera(camera_id, name)], repository)

    assert report.results[0].action == "updated"
    assert repository.rows[camera_id]["latitude"] == 44.84
    assert repository.rows[camera_id]["longitude"] == -0.57
    assert repository.rows[camera_id]["enabled"] is False
    assert repository.rows[camera_id]["status"] == "online"


@pytest.mark.parametrize("gis_point", ["POINT EMPTY", "POINT (-181 44)"])
def test_explicit_missing_or_invalid_position_saves_null(gis_point):
    camera_id, name, _ = CAMERAS[0]
    repository = MemoryRepository(
        [
            {
                "id": camera_id,
                "name": name,
                "latitude": 44.8542,
                "longitude": -0.5738,
                "location_source": "simulated",
                "enabled": True,
                "status": "unknown",
            }
        ]
    )

    report = sync_cameras([make_camera(camera_id, name, gis_point)], repository)

    assert report.results[0].action == "updated"
    assert repository.rows[camera_id]["latitude"] is None
    assert repository.rows[camera_id]["longitude"] is None


def test_absent_xprotect_camera_is_not_deleted():
    camera_id, name, _ = CAMERAS[0]
    repository = MemoryRepository(
        [
            {
                "id": camera_id,
                "name": name,
                "latitude": 44.8542,
                "longitude": -0.5738,
                "location_source": "simulated",
                "enabled": True,
                "status": "unknown",
            }
        ]
    )

    report = sync_cameras([], repository)

    assert report.discovered == 0
    assert camera_id in repository.rows


def test_duplicate_discovery_guid_is_reported_and_not_inserted_twice():
    camera_id, name, _ = CAMERAS[0]
    repository = MemoryRepository()

    report = sync_cameras(
        [make_camera(camera_id, name), make_camera(camera_id.upper(), f"{name}-duplicate")],
        repository,
    )

    assert report.counts == {"inserted": 1, "updated": 0, "unchanged": 0, "failed": 1}
    assert report.to_dict()["duplicates"] == 1
    assert len(repository.writes) == 1
