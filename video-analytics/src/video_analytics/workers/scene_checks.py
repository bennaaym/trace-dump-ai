"""Durable cleanup deadline scene-check worker."""

from __future__ import annotations

import logging
import socket
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

from ..db.client import SupabaseClient
from ..evidence.reference import validate_discarded_object_reference
from ..hafnia.client import HafniaClient
from ..hafnia.scene_comparison import analyze_scene_clip
from ..xprotect.client import build_xprotect_uri
from ..xprotect.snapshot import FreshSnapshot, capture_fresh_snapshot

logger = logging.getLogger(__name__)


class SceneCheckWorker:
    def __init__(
        self,
        client: SupabaseClient,
        hafnia: HafniaClient,
        *,
        xprotect_server: str,
        model_id: str,
        poll_interval: float = 3.0,
        poll_timeout: float = 600.0,
        worker_id: str | None = None,
    ) -> None:
        self.client = client
        self.hafnia = hafnia
        self.xprotect_server = xprotect_server
        self.model_id = model_id
        self.poll_interval = poll_interval
        self.poll_timeout = poll_timeout
        self.worker_id = worker_id or f"{socket.gethostname()}-scene-{id(self):x}"

    def process_once(self) -> bool:
        rows = self.client.request(
            "POST",
            "/rest/v1/rpc/claim_cleanup_scene_check",
            json={"p_worker_id": self.worker_id, "p_lease_seconds": 900},
        )
        if not rows:
            return False
        claim = rows[0]
        try:
            result = self._execute(claim)
        except Exception as exc:
            logger.exception(
                "cleanup_scene_check_failed check_id=%s attempt=%s",
                claim["id"],
                claim["attempt_count"],
            )
            retry = int(claim["attempt_count"]) < int(claim["max_attempts"])
            result = {
                "status": "retry" if retry else "failed",
                "assessment": "uncertain",
                "grounded_observations": [],
                "limitations": ["The scene could not be captured or analyzed."],
                "error_code": _error_code(exc),
                "error_message": str(exc)[:1000],
                "reference_evidence_id": claim.get("reference_evidence_id"),
                **_policy_result(claim),
            }
        self._finish(claim["id"], result)
        logger.info(
            "cleanup_scene_check_finished check_id=%s status=%s assessment=%s hafnia_summary_id=%s",
            claim["id"],
            result.get("status"),
            result.get("assessment"),
            result.get("hafnia_summary_id"),
        )
        return True

    def run(self, *, poll_seconds: float = 5.0) -> None:
        while True:
            if not self.process_once():
                time.sleep(max(1.0, poll_seconds))

    def _execute(self, claim: dict[str, Any]) -> dict[str, Any]:
        self._assert_still_actionable(claim["cleanup_case_id"], claim["id"])
        reference_id = claim.get("reference_evidence_id")
        reference_path = claim.get("reference_storage_path")
        if not reference_id or not reference_path:
            return {
                "status": "completed",
                "assessment": "uncertain",
                "grounded_observations": [],
                "limitations": ["No post-dumping reference evidence is available."],
                "camera_reference_matched": True,
                "object_region_observable": False,
                "fresh_frame": False,
                **_policy_result(claim),
            }

        metadata = claim.get("reference_metadata") or {}
        object_region = metadata.get("object_region")
        reference_bytes = self.client.request(
            "GET",
            "/storage/v1/object/incident-evidence/" + quote(reference_path, safe="/"),
            raw=True,
        )
        reference_verified = validate_discarded_object_reference(reference_bytes, metadata)
        snapshot = capture_fresh_snapshot(
            self.xprotect_server,
            claim["camera_id"],
        )
        snapshot_path = f"scene-checks/{claim['cleanup_case_id']}/{claim['id']}.jpg"
        self.client.request(
            "POST",
            "/storage/v1/object/cleanup-scene-checks/" + quote(snapshot_path, safe="/"),
            data=snapshot.jpeg_bytes,
            headers={"Content-Type": "image/jpeg", "x-upsert": "true"},
        )
        if not reference_verified:
            return _uncertain_reference_result(claim, snapshot, snapshot_path)

        # Human resolution may have happened during acquisition. Avoid spending a Hafnia request.
        self._assert_still_actionable(claim["cleanup_case_id"], claim["id"])
        clip_end = min(snapshot.source_timestamp, datetime.now(UTC) - timedelta(seconds=2))
        clip_start = clip_end - timedelta(seconds=15)
        video_uri = build_xprotect_uri(
            claim["camera_id"], _utc_text(clip_start), _utc_text(clip_end)
        )
        comparison = analyze_scene_clip(
            self.hafnia,
            video_uri=video_uri,
            incident_description=claim["incident_description"],
            reference_role=claim["reference_role"],
            object_region=object_region,
            model_id=self.model_id,
            poll_interval=self.poll_interval,
            poll_timeout=self.poll_timeout,
        )
        return {
            "status": "completed",
            "assessment": comparison.assessment,
            "grounded_observations": comparison.observations,
            "limitations": [
                *comparison.limitations,
                "Hafnia Gateway supports one XProtect clip, not paired uploaded images.",
            ],
            "object_region_observable": comparison.object_region_observable,
            "camera_reference_matched": True,
            "fresh_frame": True,
            "reference_evidence_id": reference_id,
            "snapshot_storage_path": snapshot_path,
            "captured_at": _utc_text(snapshot.captured_at),
            "source_timestamp": _utc_text(snapshot.source_timestamp),
            "source_age_ms": snapshot.source_age_ms,
            "model_id": comparison.model_id,
            "model_version": comparison.model_version,
            "confidence": comparison.confidence,
            "hafnia_summary_id": comparison.summary_id,
            **_policy_result(claim),
        }

    def _assert_still_actionable(self, case_id: str, check_id: str) -> None:
        cases = self.client.request(
            "GET",
            "/rest/v1/cleanup_cases",
            params={"select": "status", "id": f"eq.{case_id}", "limit": "1"},
        )
        checks = self.client.request(
            "GET",
            "/rest/v1/cleanup_scene_checks",
            params={
                "select": "status,cancellation_requested,lease_owner",
                "id": f"eq.{check_id}",
                "limit": "1",
            },
        )
        if not cases or cases[0]["status"] == "resolved":
            raise SceneCheckCancelled("Cleanup case was resolved by a human")
        if (
            not checks
            or checks[0]["status"] != "running"
            or checks[0]["cancellation_requested"]
            or checks[0]["lease_owner"] != self.worker_id
        ):
            raise SceneCheckCancelled("Scene check was cancelled or its lease was lost")

    def _finish(self, check_id: str, result: dict[str, Any]) -> None:
        self.client.request(
            "POST",
            "/rest/v1/rpc/finish_cleanup_scene_check",
            json={"p_check_id": check_id, "p_worker_id": self.worker_id, "p_result": result},
        )


class SceneCheckCancelled(RuntimeError):
    """The case became ineligible while the worker held a lease."""


def _uncertain_reference_result(
    claim: dict[str, Any], snapshot: FreshSnapshot, snapshot_path: str
) -> dict[str, Any]:
    return {
        "status": "completed",
        "assessment": "uncertain",
        "grounded_observations": [],
        "limitations": [
            "The reference evidence is not marked as showing the discarded object.",
            "No Hafnia request was made because a pre-dumping or ambiguous frame cannot prove clearance.",
        ],
        "object_region_observable": False,
        "camera_reference_matched": True,
        "fresh_frame": True,
        "reference_evidence_id": claim.get("reference_evidence_id"),
        "snapshot_storage_path": snapshot_path,
        "captured_at": _utc_text(snapshot.captured_at),
        "source_timestamp": _utc_text(snapshot.source_timestamp),
        "source_age_ms": snapshot.source_age_ms,
        **_policy_result(claim),
    }


def _policy_result(claim: dict[str, Any]) -> dict[str, bool | float]:
    return {
        "automatic_resolution_enabled": bool(claim.get("automatic_resolution_enabled")),
        "confidence_policy_validated": bool(claim.get("confidence_policy_validated")),
        "minimum_confidence": float(claim.get("minimum_confidence", 1.0)),
        "looping_source": bool(claim.get("looping_source")),
    }


def _error_code(exc: Exception) -> str:
    if isinstance(exc, SceneCheckCancelled):
        return "case_resolved"
    name = type(exc).__name__.lower()
    if "frame" in name or "miplive" in name:
        return "capture_failed"
    if "hafnia" in name:
        return "analysis_failed"
    return "scene_check_failed"


def _utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
