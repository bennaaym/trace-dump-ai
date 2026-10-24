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
        recording_settle_seconds: float = 30.0,
        clip_seconds: float = 60.0,
        worker_id: str | None = None,
    ) -> None:
        self.client = client
        self.hafnia = hafnia
        self.xprotect_server = xprotect_server
        self.model_id = model_id
        self.poll_interval = poll_interval
        self.poll_timeout = poll_timeout
        self.recording_settle_seconds = max(0.0, recording_settle_seconds)
        self.clip_seconds = max(1.0, min(60.0, clip_seconds))
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
        self._set_phase(claim["id"], "applying_decision")
        finished = self._finish(claim["id"], result)
        expected_status = "scheduled" if result.get("status") == "retry" else result.get("status")
        final_status = finished.get("status", expected_status) if finished else expected_status
        final_phase = {
            "completed": "completed",
            "cancelled": "cancelled",
            "scheduled": "queued",
        }.get(final_status, "failed")
        self._set_phase(claim["id"], final_phase)
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
        self._set_phase(claim["id"], "capturing")
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
        reference_verified = validate_discarded_object_reference(
            reference_bytes,
            metadata,
            role=claim.get("reference_role"),
        )
        capture_camera_id = self._capture_camera_id(claim["camera_id"])
        self.client.request(
            "PATCH",
            "/rest/v1/cleanup_scene_checks",
            params={"id": f"eq.{claim['id']}"},
            json={"capture_camera_id": capture_camera_id},
            headers={"Prefer": "return=minimal"},
        )
        snapshot = capture_fresh_snapshot(
            self.xprotect_server,
            capture_camera_id,
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
        self._set_phase(claim["id"], "preparing_comparison")
        recording_ready_at = snapshot.source_timestamp + timedelta(
            seconds=self.recording_settle_seconds
        )
        wait_seconds = (recording_ready_at - datetime.now(UTC)).total_seconds()
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        self._assert_still_actionable(claim["cleanup_case_id"], claim["id"])
        clip_end = min(snapshot.source_timestamp, datetime.now(UTC) - timedelta(seconds=2))
        clip_start = clip_end - timedelta(seconds=self.clip_seconds)
        video_uri = build_xprotect_uri(
            capture_camera_id, _utc_text(clip_start), _utc_text(clip_end)
        )
        self._set_phase(claim["id"], "analyzing")
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
            "cleanup_score": comparison.cleanup_score,
            "summary": comparison.summary,
            "reported_waste": comparison.reported_waste,
            "reported_location": comparison.reported_location,
            "current_observation": comparison.current_observation,
            "key_changes": comparison.key_changes,
            "limitations": comparison.limitations,
            "raw_response": comparison.raw_response,
            "gateway_input_limitations": [
                "Hafnia received one XProtect clip; the original stored image was context only."
            ],
            "object_region_observable": comparison.cleanup_area_observable,
            "current_waste_visible": comparison.current_waste_visible,
            "camera_reference_matched": True,
            "fresh_frame": True,
            "follow_up_source": (
                "Configured simulated XProtect fixture camera"
                if capture_camera_id != claim["camera_id"]
                else "Associated XProtect camera"
            ),
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

    def _capture_camera_id(self, logical_camera_id: str) -> str:
        states = self.client.request(
            "GET",
            "/rest/v1/camera_scene_state",
            params={
                "select": "status,verified_at,capture_camera_id",
                "camera_id": f"eq.{logical_camera_id}",
                "limit": "1",
            },
        )
        if not states:
            return logical_camera_id
        state = states[0]
        capture_camera_id = state.get("capture_camera_id")
        if state.get("status") != "ready" or not capture_camera_id:
            raise RuntimeError(
                "The selected scene source is not ready; switch and verify a scene before rechecking"
            )
        return str(capture_camera_id)

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

    def _finish(self, check_id: str, result: dict[str, Any]) -> dict[str, Any]:
        return self.client.request(
            "POST",
            "/rest/v1/rpc/finish_cleanup_scene_check",
            json={"p_check_id": check_id, "p_worker_id": self.worker_id, "p_result": result},
        )

    def _set_phase(self, check_id: str, phase: str) -> None:
        self.client.request(
            "PATCH",
            "/rest/v1/cleanup_scene_checks",
            params={"id": f"eq.{check_id}"},
            json={"phase": phase},
            headers={"Prefer": "return=minimal"},
        )


class SceneCheckCancelled(RuntimeError):
    """The case became ineligible while the worker held a lease."""


def _uncertain_reference_result(
    claim: dict[str, Any], snapshot: FreshSnapshot, snapshot_path: str
) -> dict[str, Any]:
    return {
        "status": "completed",
        "assessment": "uncertain",
        "summary": "The original evidence is insufficient to verify whether the reported waste was removed.",
        "reported_waste": "",
        "reported_location": "",
        "current_observation": "",
        "key_changes": [],
        "limitations": [
            "The reference evidence is not a verified post-dumping frame.",
        ],
        "gateway_input_limitations": [],
        "object_region_observable": False,
        "current_waste_visible": None,
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
