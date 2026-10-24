"""Durable Simulation Control Center command worker."""

from __future__ import annotations

import logging
import re
import socket
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from ..config import Settings, load_prompt
from ..db.client import SupabaseClient
from ..db.persistence import PendingSyncStore, SupabaseAnalysisRepository
from ..detection.activity import ActivityDetector, DetectorConfig
from ..hafnia.client import HafniaClient
from ..models import Camera
from ..xprotect.alarms import SuspectedDumpingEventPublisher
from ..xprotect.client import XProtectClient
from ..xprotect.live_frames import acquire_mip_for_duration
from ..xprotect.scene_sources import SceneSourceAdapter
from ..xprotect.snapshot import capture_fresh_snapshot
from .incident_pipeline import IncidentPipeline, SimulationStateStore
from .playback import PlaybackWorker

logger = logging.getLogger(__name__)
SIMULATION_RUN_SECONDS = 60.0

DIAGNOSTIC_COUNTERS = (
    "acquisition_windows",
    "frames_received",
    "valid_frames_decoded",
    "unique_frames",
    "changed_frames",
    "repeated_frames",
    "frame_acquisition_errors",
    "motion_positive_frames",
    "yolo_inference_calls",
    "yolo_detections",
    "activity_segments_exported",
    "hafnia_requests_sent",
    "hafnia_responses_received",
    "positive_dumping_classifications",
    "incidents_inserted",
    "incidents_suppressed_by_deduplication",
    "database_or_validation_errors",
)


class SimulationWorker:
    def __init__(
        self,
        client: SupabaseClient,
        settings: Settings,
        scene_adapter: SceneSourceAdapter,
        *,
        worker_id: str | None = None,
    ) -> None:
        self.client = client
        self.settings = settings
        self.scene_adapter = scene_adapter
        self.worker_id = worker_id or f"{socket.gethostname()}-simulation-{id(self):x}"
        self._stop_events: dict[str, threading.Event] = {}
        self._threads: dict[str, list[threading.Thread]] = {}
        self._deadlines: dict[str, float] = {}

    def run(self, *, poll_seconds: float) -> None:
        playback_thread = threading.Thread(
            target=self._playback_worker().run,
            kwargs={"poll_seconds": min(5.0, max(1.0, poll_seconds))},
            name="incident-playback-worker",
            daemon=True,
        )
        playback_thread.start()
        self._heartbeat()
        while True:
            self._reconcile_stale_runs()
            self._heartbeat()
            if not self.process_once():
                time.sleep(max(1.0, poll_seconds))

    def _playback_worker(self) -> PlaybackWorker:
        return PlaybackWorker(
            self.client,
            xprotect_server=self.settings.xprotect_base_url,
            cache_root=self.settings.playback_cache_dir,
            retention_hours=self.settings.playback_retention_hours,
            transcode_threads=self.settings.playback_transcode_threads,
            worker_id=f"{self.worker_id}-playback",
        )

    def _reconcile_stale_runs(self) -> None:
        cutoff = datetime.now(UTC) - timedelta(seconds=60)
        rows = self.client.request(
            "GET",
            "/rest/v1/simulation_monitoring_runs",
            params={
                "select": "id,status,last_heartbeat_at,worker_id",
                "status": "in.(starting,running,stopping)",
            },
        )
        for row in rows:
            if row.get("worker_id") == self.worker_id or not row.get("last_heartbeat_at"):
                continue
            heartbeat = datetime.fromisoformat(row["last_heartbeat_at"].replace("Z", "+00:00"))
            if heartbeat >= cutoff:
                continue
            status = "stopped" if row["status"] == "stopping" else "failed"
            message = None if status == "stopped" else "Monitoring worker heartbeat expired"
            self._patch_run(
                row["id"],
                status=status,
                stopped_at=_utc_now() if status == "stopped" else None,
                error_message=message,
            )
            self.client.request(
                "PATCH",
                "/rest/v1/simulation_camera_monitors",
                params={"run_id": f"eq.{row['id']}", "status": "neq.error"},
                json={"status": "stopped", "updated_at": _utc_now()},
                headers={"Prefer": "return=minimal"},
            )

    def process_once(self) -> bool:
        sync = self._flush_pending_database_sync()
        if sync.get("error"):
            logger.warning(
                "simulation_database_sync_deferred pending=%s error=%s",
                sync.get("pending"),
                sync["error"],
            )
        rows = self.client.request(
            "POST",
            "/rest/v1/rpc/claim_simulation_worker_command",
            json={"p_worker_id": self.worker_id, "p_lease_seconds": 180},
        )
        if not rows:
            return False
        command = rows[0]
        try:
            if command["kind"] == "start_monitoring":
                result = self._start_monitoring(command["run_id"])
            elif command["kind"] == "stop_monitoring":
                result = self._stop_monitoring(command["run_id"])
            elif command["kind"] == "switch_scene":
                result = self._switch_scene(command)
            else:
                raise RuntimeError(f"Unsupported simulation command: {command['kind']}")
        except Exception as exc:
            logger.exception(
                "simulation_command_failed command_id=%s kind=%s", command["id"], command["kind"]
            )
            safe_error = _safe_error_message(exc)
            self._record_command_result(command["id"], False, {}, safe_error)
            self._record_command_failure(command, safe_error)
        else:
            self._record_command_result(command["id"], True, result, None)
        return True

    def _start_monitoring(self, run_id: str) -> dict[str, Any]:
        existing = self._threads.get(run_id, [])
        if any(thread.is_alive() for thread in existing):
            return {"run_id": run_id, "already_running": True}
        yolo_model = self._local_yolo_model()
        self._patch_run(
            run_id,
            status="starting",
            worker_id=self.worker_id,
            acknowledged_at=_utc_now(),
            last_heartbeat_at=_utc_now(),
            error_message=None,
        )
        monitor_rows = self.client.request(
            "GET",
            "/rest/v1/simulation_camera_monitors",
            params={"select": "camera_id,diagnostics", "run_id": f"eq.{run_id}"},
        )
        camera_ids = [row["camera_id"] for row in monitor_rows]
        cameras = (
            self.client.request(
                "GET",
                "/rest/v1/cameras",
                params={"select": "id,name,enabled", "id": f"in.({','.join(camera_ids)})"},
            )
            if camera_ids
            else []
        )
        configured = {row["id"]: row for row in cameras}
        live = {camera.id.casefold(): camera for camera in self._xprotect().list_cameras()}
        stop_event = threading.Event()
        deadline = time.monotonic() + SIMULATION_RUN_SECONDS
        self._deadlines[run_id] = deadline
        threads: list[threading.Thread] = []
        for camera_id in camera_ids:
            row = configured.get(camera_id)
            discovered = live.get(camera_id.casefold())
            if row is None or not row["enabled"]:
                self._patch_monitor(
                    run_id,
                    camera_id,
                    status="error",
                    last_pipeline_stage="configuration_error",
                    last_pipeline_stage_at=_utc_now(),
                    error_message="Camera is no longer enabled",
                )
                continue
            if discovered is None:
                self._patch_monitor(
                    run_id,
                    camera_id,
                    status="error",
                    last_pipeline_stage="configuration_error",
                    last_pipeline_stage_at=_utc_now(),
                    error_message="Camera GUID was not found in XProtect",
                )
                continue
            camera = Camera(id=camera_id, name=row["name"], enabled=True)
            thread = threading.Thread(
                target=self._monitor_camera,
                args=(
                    run_id,
                    camera,
                    stop_event,
                    yolo_model,
                    deadline,
                    next(
                        (
                            row.get("diagnostics")
                            for row in monitor_rows
                            if row["camera_id"] == camera_id
                        ),
                        None,
                    ),
                ),
                name=f"simulation-{run_id[:8]}-{camera_id[:8]}",
                daemon=True,
            )
            thread.start()
            threads.append(thread)
        if not threads:
            self._deadlines.pop(run_id, None)
            self._patch_run(
                run_id,
                status="failed",
                error_message="No eligible camera could connect to XProtect",
            )
            raise RuntimeError("No eligible camera could connect to XProtect")
        self._stop_events[run_id] = stop_event
        self._threads[run_id] = threads
        self._patch_run(
            run_id, status="running", started_at=_utc_now(), last_heartbeat_at=_utc_now()
        )
        return {
            "run_id": run_id,
            "camera_monitors_started": len(threads),
            "simulation_seconds": int(SIMULATION_RUN_SECONDS),
        }

    def _monitor_camera(
        self,
        run_id: str,
        camera: Camera,
        stop_event: threading.Event,
        yolo_model: str,
        deadline: float,
        stored_diagnostics: dict[str, Any] | None = None,
    ) -> None:
        diagnostics = _diagnostics(stored_diagnostics)
        self._patch_monitor(
            run_id,
            camera.id,
            status="connecting",
            last_pipeline_stage="task_active",
            last_pipeline_stage_at=_utc_now(),
            diagnostics=diagnostics,
            error_message=None,
        )
        run_root = self.settings.exports_dir.parent / "monitoring" / run_id / camera.id
        try:
            pipeline = self._pipeline(run_id, camera)
            self._patch_monitor(
                run_id,
                camera.id,
                status="monitoring",
                last_pipeline_stage="acquiring_frames",
                last_pipeline_stage_at=_utc_now(),
            )
            window = 0
            consecutive_acquisition_errors = 0
            while not stop_event.is_set() and time.monotonic() < deadline:
                window += 1
                detector = ActivityDetector(
                    camera.id,
                    camera.name,
                    run_root / f"window-{window:06d}" / "debug",
                    config=DetectorConfig(model=yolo_model),
                )
                report = acquire_mip_for_duration(
                    self.settings.xprotect_base_url,
                    camera,
                    duration_seconds=min(
                        self.settings.simulation_monitor_window_seconds,
                        max(0.1, deadline - time.monotonic()),
                    ),
                    target_fps=self.settings.simulation_monitor_fps,
                    on_frame=detector.process,
                )
                _increment(
                    diagnostics,
                    acquisition_windows=1,
                    frames_received=report.source_frames_received,
                    valid_frames_decoded=report.decoded_frames,
                    unique_frames=report.unique_frames,
                    changed_frames=report.changed_frames,
                    repeated_frames=report.repeated_frames,
                    frame_acquisition_errors=report.failures,
                )
                if report.failures:
                    consecutive_acquisition_errors += 1
                    self._patch_monitor(
                        run_id,
                        camera.id,
                        status="connecting",
                        last_pipeline_stage="frame_acquisition_retry",
                        last_pipeline_stage_at=_utc_now(),
                        last_worker_activity_at=_utc_now(),
                        diagnostics=diagnostics,
                        error_message=_safe_error_message(
                            RuntimeError(report.last_error or "XProtect frame acquisition failed")
                        ),
                    )
                    if consecutive_acquisition_errors >= max(
                        1, self.settings.simulation_acquisition_retries
                    ):
                        raise RuntimeError(report.last_error or "XProtect frame acquisition failed")
                    if stop_event.wait(min(4.0, float(2 ** (consecutive_acquisition_errors - 1)))):
                        break
                    continue
                consecutive_acquisition_errors = 0
                activity = detector.finalize()
                sessions = activity["activity_sessions"]
                _increment(
                    diagnostics,
                    motion_positive_frames=activity["motion_hits"],
                    yolo_inference_calls=activity["yolo_calls"],
                    yolo_detections=activity["detections"],
                    activity_segments_exported=len(sessions),
                )
                self._patch_monitor(
                    run_id,
                    camera.id,
                    status="activity_detected" if sessions else "monitoring",
                    last_pipeline_stage=(
                        "activity_segment_exported"
                        if sessions
                        else "video_analytics_processing"
                        if activity["yolo_calls"]
                        else "frames_valid"
                    ),
                    last_pipeline_stage_at=_utc_now(),
                    last_worker_activity_at=_utc_now(),
                    diagnostics=diagnostics,
                    error_message=None,
                )
                if sessions and not stop_event.is_set():
                    existing = pipeline.state.get(run_id, camera.id)
                    already_claimed = bool(
                        existing
                        and (
                            existing.get("request_submitted")
                            or existing.get("status") in {"reserved", "submitted", "completed"}
                        )
                    )
                    if already_claimed:
                        _increment(
                            diagnostics,
                            incidents_suppressed_by_deduplication=len(sessions),
                        )
                        self._patch_monitor(run_id, camera.id, diagnostics=diagnostics)
                    elif not self._reserve_hafnia(run_id):
                        self._patch_monitor(
                            run_id,
                            camera.id,
                            last_pipeline_stage="hafnia_budget_exhausted",
                            last_pipeline_stage_at=_utc_now(),
                            diagnostics=diagnostics,
                        )
                    else:
                        self._patch_monitor(
                            run_id,
                            camera.id,
                            status="analyzing",
                            last_pipeline_stage="hafnia_analysis_in_progress",
                            last_pipeline_stage_at=_utc_now(),
                            last_segment_id=sessions[0].get("id"),
                            diagnostics=diagnostics,
                        )
                        result = pipeline.process(sessions, 1)
                        _increment(
                            diagnostics,
                            hafnia_requests_sent=result.get("requests_submitted", 0),
                            incidents_suppressed_by_deduplication=result.get(
                                "repeat_sessions_suppressed", 0
                            ),
                        )
                        outcomes = result.get("results", [])
                        responses = sum(
                            1
                            for outcome in outcomes
                            if outcome.get("summary_id")
                            and outcome.get("status") in {"completed", "failed"}
                        )
                        positives = sum(
                            1
                            for outcome in outcomes
                            if outcome.get("classification", {}).get("classification") == "yes"
                        )
                        inserted = sum(
                            1
                            for outcome in outcomes
                            if outcome.get("incident_path")
                            and not _sync_error(outcome.get("database_sync"))
                        )
                        database_errors = sum(
                            1
                            for sync in (
                                result.get("initial_database_sync"),
                                result.get("final_database_sync"),
                                *(outcome.get("database_sync") for outcome in outcomes),
                            )
                            if _sync_error(sync)
                        )
                        _increment(
                            diagnostics,
                            hafnia_responses_received=responses,
                            positive_dumping_classifications=positives,
                            incidents_inserted=inserted,
                            database_or_validation_errors=database_errors,
                        )
                        latest = next(
                            (
                                outcome
                                for outcome in reversed(outcomes)
                                if outcome.get("status") in {"completed", "failed"}
                            ),
                            outcomes[-1] if outcomes else {},
                        )
                        classification = latest.get("classification", {}).get("classification")
                        stage = (
                            "incident_created"
                            if inserted
                            else "hafnia_analysis_completed"
                            if latest.get("status") == "completed"
                            else "pipeline_error"
                        )
                        self._patch_monitor(
                            run_id,
                            camera.id,
                            status="error" if stage == "pipeline_error" else "monitoring",
                            last_pipeline_stage=stage,
                            last_pipeline_stage_at=_utc_now(),
                            last_detection_id=latest.get("detection_id"),
                            last_analysis_id=latest.get("analysis_id"),
                            last_hafnia_summary_id=latest.get("summary_id"),
                            last_classification=classification,
                            diagnostics=diagnostics,
                            error_message=(
                                _safe_error_message(RuntimeError(latest["error"]))
                                if latest.get("error")
                                else None
                            ),
                        )
                        if stage == "pipeline_error":
                            raise RuntimeError(latest.get("error") or "Pipeline analysis failed")
                if not stop_event.is_set():
                    self._patch_monitor(run_id, camera.id, status="monitoring")
        except Exception as exc:
            logger.exception("simulation_camera_failed run_id=%s camera_id=%s", run_id, camera.id)
            self._patch_monitor(
                run_id,
                camera.id,
                status="error",
                last_pipeline_stage="pipeline_error",
                last_pipeline_stage_at=_utc_now(),
                diagnostics=diagnostics,
                error_message=_safe_error_message(exc),
            )
        finally:
            if stop_event.is_set() or time.monotonic() >= deadline:
                self._patch_monitor(run_id, camera.id, status="stopped", error_message=None)

    def _pipeline(self, run_id: str, camera: Camera) -> IncidentPipeline:
        repository = SupabaseAnalysisRepository(
            self.client,
            PendingSyncStore(
                self.settings.exports_dir.parent / "state" / "pending_supabase_sync.json"
            ),
        )
        return IncidentPipeline(
            server=self.settings.xprotect_base_url,
            camera=camera,
            hafnia=self._hafnia(),
            prompt=load_prompt(self.settings.prompt_path),
            prompt_version=self.settings.prompt_path.stem,
            model_id=self.settings.hafnia_model,
            runs_root=self.settings.exports_dir.parent,
            simulation_run_id=run_id,
            state_store=SimulationStateStore(
                self.settings.exports_dir.parent / "state" / "simulation_state.json"
            ),
            poll_interval=self.settings.poll_interval,
            poll_timeout=self.settings.poll_timeout,
            recording_settle_seconds=self.settings.simulation_recording_settle_seconds,
            repository=repository,
            alarm_publisher=SuspectedDumpingEventPublisher(self._xprotect()),
        )

    def _flush_pending_database_sync(self) -> dict[str, Any]:
        repository = SupabaseAnalysisRepository(
            self.client,
            PendingSyncStore(
                self.settings.exports_dir.parent / "state" / "pending_supabase_sync.json"
            ),
        )
        return repository.flush(max_operations=20)

    def _stop_monitoring(self, run_id: str) -> dict[str, Any]:
        stop_event = self._stop_events.get(run_id)
        if stop_event is not None:
            stop_event.set()
        threads = self._threads.get(run_id, [])
        for thread in threads:
            thread.join(timeout=self.settings.simulation_monitor_window_seconds + 15)
        still_running = [thread.name for thread in threads if thread.is_alive()]
        if still_running:
            raise RuntimeError(f"Camera monitors did not stop in time: {', '.join(still_running)}")
        self.client.request(
            "PATCH",
            "/rest/v1/simulation_camera_monitors",
            params={"run_id": f"eq.{run_id}", "status": "neq.error"},
            json={"status": "stopped", "updated_at": _utc_now()},
            headers={"Prefer": "return=minimal"},
        )
        self._patch_run(
            run_id, status="stopped", stopped_at=_utc_now(), last_heartbeat_at=_utc_now()
        )
        self._threads.pop(run_id, None)
        self._stop_events.pop(run_id, None)
        self._deadlines.pop(run_id, None)
        return {"run_id": run_id, "stopped": True}

    def _switch_scene(self, command: dict[str, Any]) -> dict[str, Any]:
        camera_id = command["camera_id"]
        sources = self.client.request(
            "GET",
            "/rest/v1/camera_scene_sources",
            params={
                "select": ("id,camera_id,source_type,source_reference,target_camera_id,is_active"),
                "id": f"eq.{command['scene_source_id']}",
                "camera_id": f"eq.{camera_id}",
                "is_active": "eq.true",
                "limit": "1",
            },
        )
        if not sources:
            raise RuntimeError("Scene source is inactive or no longer belongs to this camera")
        source = sources[0]
        baseline = None
        if source["source_type"] == "xprotect_camera":
            if self.scene_adapter.name != "xprotect_camera":
                raise RuntimeError(
                    "Mapped fixture scene requires SCENE_SOURCE_ADAPTER=xprotect_camera"
                )
            target_camera_id = source.get("target_camera_id")
            if not target_camera_id or source["source_reference"] != target_camera_id:
                raise RuntimeError("Mapped scene source has no valid fixture camera")
            targets = self.client.request(
                "GET",
                "/rest/v1/cameras",
                params={
                    "select": "id,enabled,is_scene_check_fixture",
                    "id": f"eq.{target_camera_id}",
                    "limit": "1",
                },
            )
            if not targets:
                raise RuntimeError("Mapped scene target camera was not found")
            target = targets[0]
            selects_operational_camera = target_camera_id == camera_id
            valid_operational_camera = (
                selects_operational_camera
                and target.get("enabled") is True
                and target.get("is_scene_check_fixture") is False
            )
            valid_fixture_camera = (
                not selects_operational_camera
                and target.get("enabled") is False
                and target.get("is_scene_check_fixture") is True
            )
            if not valid_operational_camera and not valid_fixture_camera:
                raise RuntimeError(
                    "Mapped scene target must be the operational camera or its disabled fixture"
                )
        else:
            baseline = capture_fresh_snapshot(self.settings.xprotect_base_url, camera_id)
        requested_at = datetime.now(UTC)
        self.scene_adapter.switch(camera_id, source["source_type"], source["source_reference"])
        deadline = time.monotonic() + self.settings.scene_source_ready_timeout
        backend_state = None
        while time.monotonic() < deadline:
            backend_state = self.scene_adapter.state(camera_id)
            if backend_state.ready and backend_state.source_reference == source["source_reference"]:
                break
            time.sleep(1.0)
        else:
            raise RuntimeError(
                "Scene-source backend did not verify the selected source before timeout"
            )
        capture_camera_id = backend_state.capture_camera_id or camera_id
        snapshot = capture_fresh_snapshot(self.settings.xprotect_base_url, capture_camera_id)
        source_transition_not_visible = (
            source["source_type"] != "xprotect_camera" and snapshot.source_timestamp <= requested_at
        )
        if source_transition_not_visible or (
            baseline is not None and snapshot.sha256 == baseline.sha256
        ):
            raise RuntimeError(
                "XProtect did not return a changed frame newer than the verified source transition"
            )
        self.client.request(
            "POST",
            "/rest/v1/camera_scene_state",
            params={"on_conflict": "camera_id"},
            json={
                "camera_id": camera_id,
                "scene_source_id": source["id"],
                "status": "ready",
                "adapter_name": self.scene_adapter.name,
                "backend_generation": backend_state.generation,
                "capture_camera_id": capture_camera_id,
                "verified_at": _utc_now(),
                "xprotect_frame_at": _utc_text(snapshot.source_timestamp),
                "error_message": None,
                "updated_at": _utc_now(),
            },
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        return {
            "camera_id": camera_id,
            "scene_source_id": source["id"],
            "adapter": self.scene_adapter.name,
            "capture_camera_id": capture_camera_id,
            "backend_generation": backend_state.generation,
            "xprotect_frame_at": _utc_text(snapshot.source_timestamp),
        }

    def _record_command_failure(self, command: dict[str, Any], error: str) -> None:
        if command["kind"] == "start_monitoring" and command.get("run_id"):
            self._patch_run(command["run_id"], status="failed", error_message=error)
        if command["kind"] == "switch_scene" and command.get("camera_id"):
            self.client.request(
                "PATCH",
                "/rest/v1/camera_scene_state",
                params={"camera_id": f"eq.{command['camera_id']}"},
                json={"status": "error", "error_message": error, "updated_at": _utc_now()},
                headers={"Prefer": "return=minimal"},
            )

    def _record_command_result(
        self, command_id: str, succeeded: bool, result: dict[str, Any], error: str | None
    ) -> None:
        self.client.request(
            "POST",
            "/rest/v1/rpc/finish_simulation_worker_command",
            json={
                "p_command_id": command_id,
                "p_worker_id": self.worker_id,
                "p_succeeded": succeeded,
                "p_result": result,
                "p_error_message": error,
            },
        )

    def _reserve_hafnia(self, run_id: str) -> bool:
        result = self.client.request(
            "POST",
            "/rest/v1/rpc/reserve_simulation_hafnia_request",
            json={"p_run_id": run_id, "p_worker_id": self.worker_id},
        )
        return bool(result)

    def _patch_run(self, run_id: str, **changes: Any) -> None:
        changes["updated_at"] = _utc_now()
        self.client.request(
            "PATCH",
            "/rest/v1/simulation_monitoring_runs",
            params={"id": f"eq.{run_id}"},
            json=changes,
            headers={"Prefer": "return=minimal"},
        )

    def _patch_monitor(self, run_id: str, camera_id: str, **changes: Any) -> None:
        changes["updated_at"] = _utc_now()
        self.client.request(
            "PATCH",
            "/rest/v1/simulation_camera_monitors",
            params={"run_id": f"eq.{run_id}", "camera_id": f"eq.{camera_id}"},
            json=changes,
            headers={"Prefer": "return=minimal"},
        )

    def _heartbeat(self) -> None:
        now = _utc_now()
        self.client.request(
            "POST",
            "/rest/v1/simulation_worker_heartbeats",
            params={"on_conflict": "worker_id"},
            json={"worker_id": self.worker_id, "last_seen_at": now, "version": "0.1.0"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        finished_runs: list[str] = []
        for run_id, threads in self._threads.items():
            running = any(thread.is_alive() for thread in threads)
            expired = time.monotonic() >= self._deadlines.get(run_id, float("inf"))
            if running:
                # Capture has stopped at the deadline, but keep the run reservable while
                # final segments and already-submitted analyses finish.
                self._patch_run(run_id, last_heartbeat_at=now)
            elif expired or self._stop_events[run_id].is_set():
                self._patch_run(
                    run_id,
                    status="stopped",
                    stopped_at=now,
                    last_heartbeat_at=now,
                    error_message=None,
                )
                finished_runs.append(run_id)
            else:
                self._patch_run(
                    run_id,
                    status="failed",
                    last_heartbeat_at=now,
                    error_message="All camera monitors stopped after errors",
                )
                finished_runs.append(run_id)
        for run_id in finished_runs:
            self._threads.pop(run_id, None)
            self._stop_events.pop(run_id, None)
            self._deadlines.pop(run_id, None)

    def _xprotect(self) -> XProtectClient:
        if not self.settings.xprotect_username or not self.settings.xprotect_password:
            raise RuntimeError("XPROTECT_USERNAME and XPROTECT_PASSWORD are required")
        return XProtectClient(
            self.settings.xprotect_base_url,
            self.settings.xprotect_username,
            self.settings.xprotect_password,
            timeout=self.settings.request_timeout,
        )

    def _hafnia(self) -> HafniaClient:
        if not self.settings.hafnia_password:
            raise RuntimeError("HAFNIA_GW_PASSWORD is required")
        return HafniaClient(
            self.settings.hafnia_base_url,
            self.settings.hafnia_username,
            self.settings.hafnia_password,
            verify=self.settings.hafnia_tls_verify,
            timeout=self.settings.request_timeout,
        )

    def _local_yolo_model(self) -> str:
        configured = self.settings.simulation_yolo_model.strip()
        if not configured:
            raise RuntimeError("SIMULATION_YOLO_MODEL is not configured")
        path = Path(configured).expanduser().resolve()
        if not path.is_file():
            raise RuntimeError(f"SIMULATION_YOLO_MODEL does not exist: {path}")
        if path.suffix.casefold() != ".pt":
            raise RuntimeError("SIMULATION_YOLO_MODEL must be a local .pt file")
        return str(path)


def _utc_now() -> str:
    return _utc_text(datetime.now(UTC))


def _diagnostics(stored: dict[str, Any] | None) -> dict[str, int]:
    source = stored if isinstance(stored, dict) else {}
    return {
        name: max(0, int(source.get(name, 0)))
        if isinstance(source.get(name, 0), int | float)
        else 0
        for name in DIAGNOSTIC_COUNTERS
    }


def _increment(diagnostics: dict[str, int], **changes: int) -> None:
    for name, amount in changes.items():
        diagnostics[name] = diagnostics.get(name, 0) + max(0, int(amount))


def _sync_error(sync: Any) -> bool:
    return isinstance(sync, dict) and bool(sync.get("error"))


def _utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _safe_error_message(error: Exception) -> str:
    message = re.sub(r"https?://\S+", "[redacted URL]", str(error))
    return message[:500]
