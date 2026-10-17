"""Bounded on-demand preparation of private incident playback derivatives."""

from __future__ import annotations

import json
import logging
import shutil
import socket
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

from ..db.client import SupabaseClient
from ..xprotect.playback import file_sha256, transcode_browser_mp4, validate_duration
from ..xprotect.video_export import VideoExportError, probe_video, run_mip_export

logger = logging.getLogger(__name__)


class PlaybackWorker:
    def __init__(
        self,
        client: SupabaseClient,
        *,
        xprotect_server: str,
        cache_root: Path,
        retention_hours: int = 24,
        transcode_threads: int = 1,
        worker_id: str | None = None,
    ) -> None:
        if retention_hours < 1:
            raise ValueError("Playback retention must be at least one hour")
        self.client = client
        self.xprotect_server = xprotect_server
        self.cache_root = cache_root
        self.retention_hours = retention_hours
        self.transcode_threads = transcode_threads
        self.worker_id = worker_id or f"{socket.gethostname()}-{id(self):x}"

    def process_once(self) -> bool:
        self.cleanup_expired()
        rows = self.client.request(
            "POST",
            "/rest/v1/rpc/claim_incident_recording",
            json={"p_worker_id": self.worker_id, "p_lease_seconds": 600},
        )
        if not rows:
            return False
        claim = rows[0]
        incident_id = claim["incident_id"]
        try:
            self._prepare(claim)
        except Exception as exc:
            status = "unavailable" if _is_unavailable(exc) else "failed"
            logger.exception(
                "playback_preparation_failed incident_id=%s status=%s",
                incident_id,
                status,
            )
            self._update(
                incident_id,
                {
                    "status": status,
                    "error_code": _error_code(exc),
                    "lease_owner": None,
                    "lease_expires_at": None,
                },
            )
        return True

    def run(self, *, poll_seconds: float = 5.0) -> None:
        while True:
            if not self.process_once():
                time.sleep(max(1.0, poll_seconds))

    def _prepare(self, claim: dict[str, Any]) -> None:
        incident_id = claim["incident_id"]
        identity = claim["recording_identity"]
        start = _parse_utc(claim["recording_start_at"])
        end = _parse_utc(claim["recording_end_at"])
        expected_duration = (end - start).total_seconds()
        if expected_duration <= 0 or expected_duration > 600:
            raise VideoExportError("Stored recording interval is outside playback limits")

        directory = self.cache_root / incident_id / identity
        playable = directory / "playback.mp4"
        source_description = "cached browser derivative"
        if playable.is_file():
            validate_duration(probe_video(playable).duration_seconds, expected_duration)
            probe = probe_video(playable)
        else:
            source = self._existing_evidence_export(claim, start=start, end=end)
            if source is not None:
                source_description = "validated local evidence AVI export"
            else:
                source = directory / "xprotect-original.avi"
                source_description = "Milestone MIP SDK AVIExporter"
            if not source.is_file():
                source = run_mip_export(
                    server=self.xprotect_server,
                    camera_id=claim["camera_id"],
                    start=_utc_text(start),
                    end=_utc_text(end),
                    output_directory=directory,
                    filename="xprotect-original.avi",
                )
            probe = transcode_browser_mp4(
                source,
                playable,
                expected_duration_seconds=expected_duration,
                threads=self.transcode_threads,
            )

        storage_path = f"incidents/{incident_id}/{identity}.mp4"
        self.client.request(
            "POST",
            "/storage/v1/object/incident-recordings/" + quote(storage_path, safe="/"),
            data=playable.read_bytes(),
            headers={"Content-Type": "video/mp4", "x-upsert": "true"},
        )
        completed = datetime.now(UTC)
        self._update(
            incident_id,
            {
                "status": "available",
                "storage_path": storage_path,
                "content_type": "video/mp4",
                "duration_seconds": probe.duration_seconds,
                "sha256": file_sha256(playable),
                "completed_at": _utc_text(completed),
                "retention_expires_at": _utc_text(
                    completed + timedelta(hours=self.retention_hours)
                ),
                "lease_owner": None,
                "lease_expires_at": None,
                "error_code": None,
                "provenance": {
                    "source": source_description,
                    "derivative": "ffmpeg libx264/AAC yuv420p faststart",
                    "recording_identity": identity,
                    "expected_duration_seconds": expected_duration,
                },
            },
        )
        logger.info("playback_preparation_completed incident_id=%s", incident_id)

    def _existing_evidence_export(
        self,
        claim: dict[str, Any],
        *,
        start: datetime,
        end: datetime,
    ) -> Path | None:
        """Return the incident's exact AVI export when its identity still matches."""
        runs_root = self.cache_root.parent.resolve()
        manifest_path = runs_root / "incidents" / claim["incident_id"] / "incident.json"
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            source = Path(manifest["xprotect_export_path"]).resolve()
            if manifest.get("id") != claim["incident_id"]:
                return None
            if str(manifest.get("camera_id", "")).casefold() != str(claim["camera_id"]).casefold():
                return None
            if abs((_parse_utc(manifest["recording_start_utc"]) - start).total_seconds()) > 0.001:
                return None
            if abs((_parse_utc(manifest["recording_end_utc"]) - end).total_seconds()) > 0.001:
                return None
            if source.suffix.casefold() != ".avi" or not source.is_relative_to(runs_root):
                return None
            return source if source.is_file() else None
        except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError):
            return None

    def cleanup_expired(self) -> int:
        now = _utc_text(datetime.now(UTC))
        rows = self.client.request(
            "GET",
            "/rest/v1/incident_recordings",
            params={
                "select": "incident_id,storage_path",
                "status": "eq.available",
                "retention_expires_at": f"lt.{now}",
            },
        )
        cleaned = 0
        for row in rows or []:
            path = row.get("storage_path")
            if path:
                self.client.request(
                    "DELETE",
                    "/storage/v1/object/incident-recordings/" + quote(path, safe="/"),
                )
                identity = Path(path).stem
                cache_directory = (self.cache_root / row["incident_id"] / identity).resolve()
                cache_root = self.cache_root.resolve()
                if cache_directory.is_relative_to(cache_root):
                    shutil.rmtree(cache_directory, ignore_errors=True)
            self._update(
                row["incident_id"],
                {"status": "expired", "storage_path": None, "error_code": None},
            )
            cleaned += 1
        return cleaned

    def _update(self, incident_id: str, values: dict[str, Any]) -> None:
        self.client.request(
            "PATCH",
            "/rest/v1/incident_recordings",
            params={"incident_id": f"eq.{incident_id}"},
            json=values,
            headers={"Prefer": "return=minimal"},
        )


def _parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise VideoExportError("Playback timestamp is missing a timezone")
    return parsed.astimezone(UTC)


def _utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _is_unavailable(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(term in text for term in ("not found", "not accessible", "no recording"))


def _error_code(exc: Exception) -> str:
    if _is_unavailable(exc):
        return "xprotect_recording_unavailable"
    if "duration mismatch" in str(exc).lower():
        return "duration_mismatch"
    if "ffmpeg" in str(exc).lower():
        return "conversion_failed"
    return "preparation_failed"
