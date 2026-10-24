"""Persistent Hafnia analysis and XProtect evidence extraction for closed sessions."""

from __future__ import annotations

import json
import math
import os
import re
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from ..db.persistence import (
    AnalysisRepository,
    insert_operation,
    occurred_at,
    stable_id,
    update_operation,
    upload_operation,
)
from ..detection.activity import write_json_atomic
from ..detection.plates import PlateRecognizer
from ..evidence import extract_evidence_frames
from ..evidence.plates import extract_plate_evidence
from ..hafnia.client import HafniaClient, HafniaError
from ..hafnia.investigation import event_reference_matches, response_text, structured_response
from ..hafnia.prompting import recording_prompt
from ..models import Camera
from ..xprotect.client import validate_utc_timestamp
from ..xprotect.positioning import parse_camera_position
from ..xprotect.video_export import run_mip_export

FIELD_NAMES = (
    "Dumping detected",
    "Dumping type",
    "Event timestamp",
    "Sequence of events",
    "People involved",
    "Vehicles involved",
    "Objects involved",
    "Evidence",
    "Uncertainties",
)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _field(response: str, name: str) -> str | None:
    labels = "|".join(re.escape(item) for item in FIELD_NAMES)
    match = re.search(
        rf"(?ims)^\s*(?:\*\*)?{re.escape(name)}(?:\*\*)?\s*:\s*(.*?)(?=^\s*(?:\*\*)?(?:{labels})(?:\*\*)?\s*:|\Z)",
        response,
    )
    return match.group(1).strip() if match else None


def _event_seconds(value: str | None) -> float | None:
    if not value:
        return None
    # Accept one clip-relative time only; never silently reinterpret ranges,
    # negative offsets, or wall-clock timestamps as a positive event position.
    match = re.fullmatch(
        r"\s*(?:(?:approximately|approximate|about|around|at)\s+)?"
        r"(?:(\d+):(\d{2}(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?)"
        r"(?:\s+(?:from (?:the )?(?:beginning|start)(?: of (?:the |this )?(?:video|clip|recording))?))?\s*\.?\s*",
        value,
        re.I,
    )
    if not match:
        return None
    if match.group(1) is not None:
        seconds = float(match.group(2))
        return int(match.group(1)) * 60 + seconds if seconds < 60 else None
    return float(match.group(3))


def parse_dumping_response(
    response: str, *, require_event_reference: bool = False
) -> dict[str, Any]:
    structured = structured_response(response)
    if structured is not None:
        classification = structured.get("dumping_detected", "uncertain")
        kind = structured.get("dumping_type", "unknown")

        def text(key: str) -> str | None:
            return response_text(structured.get(key))

        offset = structured.get("event_offset_seconds")
        unsupported_timing = (
            "event_timing_basis" in structured
            and structured.get("event_timing_basis") != "visible_release"
        ) or ("deposit_observed" in structured and structured.get("deposit_observed") != "yes")
        if require_event_reference or "event_observation_id" in structured:
            unsupported_timing = unsupported_timing or not event_reference_matches(structured)
        uncertainty = text("uncertainty")
        if offset is not None and unsupported_timing:
            uncertainty = ((uncertainty + " ") if uncertainty else "") + (
                "Event time withheld: a consistent, timed release observation was not supplied."
            )
        return {
            "classification": classification
            if classification in ("yes", "no", "uncertain")
            else "uncertain",
            "dumping_type": kind if kind in ("static", "dynamic", "unknown") else "unknown",
            "event_timestamp_text": str(offset) if offset is not None else "Unknown",
            "event_offset_seconds": offset
            if (
                isinstance(offset, (int, float))
                and not isinstance(offset, bool)
                and math.isfinite(offset)
                and offset >= 0
                and not unsupported_timing
            )
            else None,
            "description": text("description") or "No description supplied by the model.",
            "people": text("people"),
            "vehicles": text("vehicles"),
            "objects": text("objects"),
            "evidence": text("evidence"),
            "uncertainty": uncertainty,
            "observations": structured["observations"],
        }
    detected_text = _field(response, "Dumping detected") or "Uncertain"
    detected_token = re.search(r"\b(yes|no|uncertain)\b", detected_text, re.I)
    classification = detected_token.group(1).lower() if detected_token else "uncertain"
    type_text = _field(response, "Dumping type") or "Unknown"
    type_token = re.search(r"\b(static|dynamic|unknown)\b", type_text, re.I)
    dumping_type = type_token.group(1).lower() if type_token else "unknown"
    event_text = _field(response, "Event timestamp")
    uncertainty = _field(response, "Uncertainties")
    if require_event_reference and _event_seconds(event_text) is not None:
        uncertainty = ((uncertainty + " ") if uncertainty else "") + (
            "Event time withheld: a consistent, timed release observation was not supplied."
        )
    return {
        "classification": classification,
        "dumping_type": dumping_type,
        "event_timestamp_text": event_text,
        "event_offset_seconds": None if require_event_reference else _event_seconds(event_text),
        "description": _field(response, "Sequence of events") or response.strip(),
        "people": _field(response, "People involved"),
        "vehicles": _field(response, "Vehicles involved"),
        "objects": _field(response, "Objects involved"),
        "evidence": _field(response, "Evidence"),
        "uncertainty": uncertainty,
    }


class SimulationStateStore:
    """Small atomic state store; an exclusive lock prevents double submission."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock_path = path.with_suffix(path.suffix + ".lock")

    def _acquire(self, timeout: float = 10.0) -> None:
        deadline = time.monotonic() + timeout
        self.path.parent.mkdir(parents=True, exist_ok=True)
        while True:
            try:
                descriptor = os.open(self.lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(descriptor)
                return
            except FileExistsError:
                if time.monotonic() >= deadline:
                    raise RuntimeError(f"Timed out locking simulation state: {self.path}") from None
                time.sleep(0.05)

    def _release(self) -> None:
        self.lock_path.unlink(missing_ok=True)

    def _read(self) -> dict[str, Any]:
        if not self.path.is_file():
            return {"version": 1, "simulation_runs": {}}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def get(self, run_id: str, camera_id: str) -> dict[str, Any] | None:
        state = self._read()
        return state.get("simulation_runs", {}).get(run_id, {}).get("cameras", {}).get(camera_id)

    def reserve(
        self, run_id: str, camera_id: str, session: dict[str, Any]
    ) -> tuple[bool, dict[str, Any]]:
        self._acquire()
        try:
            state = self._read()
            cameras = state.setdefault("simulation_runs", {}).setdefault(run_id, {"cameras": {}})[
                "cameras"
            ]
            existing = cameras.get(camera_id)
            if existing and (
                existing.get("request_submitted")
                or existing.get("status") in {"reserved", "submitted", "completed"}
            ):
                return False, existing
            entry = {
                "status": "reserved",
                "reserved_at_utc": _utc_now(),
                "camera_id": camera_id,
                "session": session,
                "summary_id": None,
                "request_submitted": False,
            }
            cameras[camera_id] = entry
            write_json_atomic(self.path, state)
            return True, entry
        finally:
            self._release()

    def update(self, run_id: str, camera_id: str, **changes: Any) -> dict[str, Any]:
        self._acquire()
        try:
            state = self._read()
            entry = state["simulation_runs"][run_id]["cameras"][camera_id]
            entry.update(changes)
            entry["updated_at_utc"] = _utc_now()
            write_json_atomic(self.path, state)
            return entry
        finally:
            self._release()


class IncidentPipeline:
    def __init__(
        self,
        *,
        server: str,
        camera: Camera,
        hafnia: HafniaClient,
        prompt: str,
        prompt_version: str,
        model_id: str,
        runs_root: Path,
        simulation_run_id: str,
        state_store: SimulationStateStore,
        poll_interval: float,
        poll_timeout: float,
        repository: AnalysisRepository | None = None,
        detector_metadata: dict[str, Any] | None = None,
        plate_recognizer: PlateRecognizer | None = None,
    ) -> None:
        self.server = server
        self.camera = camera
        self.hafnia = hafnia
        self.prompt = prompt
        self.prompt_version = prompt_version
        self.model_id = model_id
        self.runs_root = runs_root
        self.simulation_run_id = simulation_run_id
        self.state = state_store
        self.poll_interval = poll_interval
        self.poll_timeout = poll_timeout
        self.repository = repository
        self.detector_metadata = detector_metadata or {}
        self.plate_recognizer = plate_recognizer

    def _queue(self, operation: dict[str, Any]) -> None:
        if self.repository is not None:
            self.repository.queue(operation)

    def _flush(self) -> dict[str, Any] | None:
        return self.repository.flush() if self.repository is not None else None

    def _record_ids(self, session: dict[str, Any]) -> tuple[str, str]:
        detection_id = stable_id(
            "detection",
            self.simulation_run_id,
            self.camera.id,
        )
        return detection_id, stable_id("analysis", detection_id, "hafnia-1")

    def _queue_detection_and_analysis(self, session: dict[str, Any]) -> tuple[str, str]:
        detection_id, analysis_id = self._record_ids(session)
        metadata = {
            "simulation_run_id": self.simulation_run_id,
            "activity_session_id": session["id"],
            "hit_count": session.get("hit_count"),
            "actor_classes": session.get("actor_classes", []),
            **self.detector_metadata,
        }
        self._queue(
            insert_operation(
                "detections",
                {
                    "id": detection_id,
                    "camera_id": self.camera.id,
                    "activity_start_at": session["activity_start_utc"],
                    "activity_end_at": session["activity_end_utc"],
                    "recording_start_at": session["recording_start_utc"],
                    "recording_end_at": session["recording_end_utc"],
                    "recording_uri": session["xprotect_uri"],
                    "metadata": metadata,
                },
            )
        )
        self._queue(
            insert_operation(
                "analyses",
                {
                    "id": analysis_id,
                    "detection_id": detection_id,
                    "status": "pending",
                    "prompt_version": self.prompt_version,
                    "model_id": self.model_id,
                },
            )
        )
        self._flush()
        return detection_id, analysis_id

    def process(self, sessions: list[dict[str, Any]], max_requests: int) -> dict[str, Any]:
        initial_sync = self._flush()
        results: list[dict[str, Any]] = []
        requests_submitted = 0
        suppressed = 0
        for session in sessions:
            existing = self.state.get(self.simulation_run_id, self.camera.id)
            if existing and existing.get("status") == "submitted" and existing.get("summary_id"):
                detection_id, analysis_id = self._record_ids(existing["session"])
                try:
                    result = self._finish(
                        existing["session"],
                        existing["summary_id"],
                        None,
                        detection_id,
                        analysis_id,
                    )
                except Exception as exc:
                    if not isinstance(exc, HafniaError):
                        self._queue_analysis_failure(analysis_id, existing["summary_id"], exc)
                    self.state.update(
                        self.simulation_run_id,
                        self.camera.id,
                        status="failed",
                        error=str(exc),
                        failed_at_utc=_utc_now(),
                    )
                    result = {
                        "status": "failed",
                        "summary_id": existing["summary_id"],
                        "error": str(exc),
                    }
                results.append(result)
                continue
            if requests_submitted >= max_requests:
                results.append(
                    {
                        "status": "skipped",
                        "reason": "maximum Hafnia request count reached",
                    }
                )
                continue
            claimed, entry = self.state.reserve(self.simulation_run_id, self.camera.id, session)
            if not claimed:
                suppressed += 1
                results.append(
                    {
                        "status": "suppressed",
                        "reason": f"camera already {entry.get('status')} in simulation run",
                        "summary_id": entry.get("summary_id"),
                    }
                )
                continue
            detection_id, analysis_id = self._queue_detection_and_analysis(session)
            end = validate_utc_timestamp(session["recording_end_utc"])
            wait_seconds = (end + timedelta(seconds=2) - datetime.now(UTC)).total_seconds()
            if wait_seconds > 0:
                time.sleep(wait_seconds)
            summary_id: str | None = None
            try:
                prompt = self.prompt
                if self.prompt_version in ("dumping_v6", "dumping_v7"):
                    duration = (
                        end - validate_utc_timestamp(session["recording_start_utc"])
                    ).total_seconds()
                    prompt = recording_prompt(prompt, duration)
                request, created = self.hafnia.create_summary(
                    prompt, session["xprotect_uri"], self.model_id
                )
                requests_submitted += 1
                summary_id = created["Id"]
                self._queue(
                    update_operation(
                        "analyses",
                        analysis_id,
                        "processing",
                        {
                            "status": "processing",
                            "hafnia_summary_id": summary_id,
                            "started_at": _utc_now(),
                        },
                    )
                )
                self._flush()
                self.state.update(
                    self.simulation_run_id,
                    self.camera.id,
                    status="submitted",
                    request_submitted=True,
                    summary_id=summary_id,
                )
                analysis_dir = (
                    self.runs_root / "analyses" / re.sub(r"[^A-Za-z0-9_.-]", "_", summary_id)
                )
                analysis_dir.mkdir(parents=True, exist_ok=True)
                write_json_atomic(analysis_dir / "request.json", request)
                write_json_atomic(analysis_dir / "created.json", created)
                result = self._finish(session, summary_id, request, detection_id, analysis_id)
            except Exception as exc:
                if summary_id is None or not isinstance(exc, HafniaError):
                    self._queue_analysis_failure(analysis_id, summary_id, exc)
                self.state.update(
                    self.simulation_run_id,
                    self.camera.id,
                    status="failed",
                    error=str(exc),
                    failed_at_utc=_utc_now(),
                )
                result = {"status": "failed", "error": str(exc)}
            results.append(result)
        return {
            "requests_submitted": requests_submitted,
            "repeat_sessions_suppressed": suppressed,
            "results": results,
            "initial_database_sync": initial_sync,
            "final_database_sync": self._flush(),
        }

    def _finish(
        self,
        session: dict[str, Any],
        summary_id: str,
        request: dict[str, Any] | None,
        detection_id: str,
        analysis_id: str,
    ) -> dict[str, Any]:
        analysis_dir = self.runs_root / "analyses" / re.sub(r"[^A-Za-z0-9_.-]", "_", summary_id)
        analysis_dir.mkdir(parents=True, exist_ok=True)
        try:
            response = self.hafnia.wait_for_summary(
                summary_id, interval=self.poll_interval, timeout=self.poll_timeout
            )
        except HafniaError as exc:
            try:
                response = self.hafnia.get_summary(summary_id)
                write_json_atomic(analysis_dir / "response.json", response)
            finally:
                self._queue_analysis_failure(analysis_id, summary_id, exc, locals().get("response"))
                raise
        write_json_atomic(analysis_dir / "response.json", response)
        raw_text = response.get("Response") or ""
        parsed = parse_dumping_response(
            raw_text, require_event_reference=self.prompt_version == "dumping_v7"
        )
        duration = (
            validate_utc_timestamp(session["recording_end_utc"])
            - validate_utc_timestamp(session["recording_start_utc"])
        ).total_seconds()
        structured = structured_response(raw_text, duration)
        if structured is not None:
            parsed["observations"] = structured["observations"]
        offset = parsed["event_offset_seconds"]
        if offset is not None and not 0 <= offset < duration:
            parsed["event_offset_seconds"] = None
        metadata = {
            "camera_id": self.camera.id,
            "camera_name": self.camera.name,
            "simulation_run_id": self.simulation_run_id,
            "prompt_version": self.prompt_version,
            "model_id": self.model_id,
            "summary_id": summary_id,
            "recording_uri": session["xprotect_uri"],
            "activity_session": session,
            "classification": parsed,
            "completed_at_utc": _utc_now(),
        }
        write_json_atomic(analysis_dir / "metadata.json", metadata)
        completed_at = _utc_now()
        self._queue(
            update_operation(
                "analyses",
                analysis_id,
                "completed",
                {
                    "status": "completed",
                    "hafnia_summary_id": summary_id,
                    "dumping_detected": parsed["classification"],
                    "dumping_type": parsed["dumping_type"],
                    "event_offset_seconds": parsed["event_offset_seconds"],
                    "description": parsed["description"],
                    "uncertainty": parsed["uncertainty"],
                    "raw_response": response,
                    "completed_at": completed_at,
                },
            )
        )
        self._flush()
        incident_path: str | None = None
        evidence_status = "not_requested"
        if parsed["classification"] == "yes":
            incident_path, evidence_status = self._create_incident(
                session, summary_id, response, parsed, analysis_dir, detection_id, analysis_id
            )
        self.state.update(
            self.simulation_run_id,
            self.camera.id,
            status="completed",
            classification=parsed["classification"],
            summary_id=summary_id,
            incident_path=incident_path,
            evidence_status=evidence_status,
            completed_at_utc=_utc_now(),
        )
        return {
            "status": "completed",
            "summary_id": summary_id,
            "classification": parsed,
            "analysis_path": str(analysis_dir.resolve()),
            "incident_path": incident_path,
            "evidence_status": evidence_status,
            "detection_id": detection_id,
            "analysis_id": analysis_id,
            "database_sync": self._flush(),
        }

    def _queue_analysis_failure(
        self,
        analysis_id: str,
        summary_id: str | None,
        error: Exception,
        response: dict[str, Any] | None = None,
    ) -> None:
        values: dict[str, Any] = {
            "status": "failed",
            "error_message": str(error),
            "completed_at": _utc_now(),
        }
        if summary_id:
            values["hafnia_summary_id"] = summary_id
        if response is not None:
            values["raw_response"] = response
        self._queue(update_operation("analyses", analysis_id, "failed", values))
        self._flush()

    def _create_incident(
        self,
        session: dict[str, Any],
        summary_id: str,
        response: dict[str, Any],
        parsed: dict[str, Any],
        analysis_dir: Path,
        detection_id: str | None = None,
        analysis_id: str | None = None,
    ) -> tuple[str, str]:
        if detection_id is None or analysis_id is None:
            detection_id, analysis_id = self._record_ids(session)
        incident_id = stable_id("incident", detection_id)
        incident_dir = self.runs_root / "incidents" / incident_id
        evidence_dir = incident_dir / "evidence"
        export_dir = analysis_dir / "xprotect_export"
        evidence: list[dict[str, Any]] = []
        evidence_status = "failed"
        evidence_error: str | None = None
        export_path: str | None = None
        video_info: dict[str, Any] | None = None
        try:
            video = run_mip_export(
                server=self.server,
                camera_id=self.camera.id,
                start=session["recording_start_utc"],
                end=session["recording_end_utc"],
                output_directory=export_dir,
                filename="recording.avi",
            )
            export_path = str(video.resolve())
            evidence, video_info = extract_evidence_frames(
                video,
                evidence_dir,
                session["recording_start_utc"],
                session["xprotect_uri"],
                parsed["event_offset_seconds"],
            )
            if parsed.get("observations"):
                from ..evidence.extraction import extract_observation_frames

                evidence.extend(
                    extract_observation_frames(
                        video,
                        evidence_dir,
                        session["recording_start_utc"],
                        session["xprotect_uri"],
                        parsed["observations"],
                    )
                )
            plate_scan = {"status": "not_requested"}
            if self.plate_recognizer is not None:
                try:
                    plate_frames, plate_scan = extract_plate_evidence(
                        video,
                        evidence_dir / "plates",
                        session["recording_start_utc"],
                        session["xprotect_uri"],
                        self.plate_recognizer,
                    )
                    evidence.extend(plate_frames)
                except (RuntimeError, OSError, ValueError):
                    plate_scan = {
                        "status": "failed",
                        "limitations": "Plate processing failed; no plate conclusion available.",
                    }
            video_info["plate_scan"] = plate_scan
            if evidence:
                evidence[0].setdefault("metadata", {})["plate_scan"] = plate_scan
            evidence_status = (
                "complete" if evidence and not video_info.get("extraction_errors") else "partial"
            )
        except Exception as exc:
            evidence_error = str(exc)
        position = parse_camera_position(self.camera)
        latitude, longitude = position.latitude, position.longitude
        incident = {
            "id": incident_id,
            "camera_id": self.camera.id,
            "camera_name": self.camera.name,
            "latitude": latitude,
            "longitude": longitude,
            "location_source": "simulated" if latitude is not None else None,
            "classification": f"{parsed['dumping_type']}_dumping"
            if parsed["dumping_type"] in {"static", "dynamic"}
            else "unknown_dumping",
            "review_status": "pending_review",
            "activity_start_utc": session["activity_start_utc"],
            "activity_end_utc": session["activity_end_utc"],
            "recording_start_utc": session["recording_start_utc"],
            "recording_end_utc": session["recording_end_utc"],
            "recording_uri": session["xprotect_uri"],
            "hafnia_summary_id": summary_id,
            "description": parsed["description"],
            "uncertainty": parsed["uncertainty"],
            "hafnia_classification": parsed,
            "raw_analysis_response_path": str((analysis_dir / "response.json").resolve()),
            "xprotect_export_path": export_path,
            "evidence_status": evidence_status,
            "evidence_error": evidence_error,
            "evidence": evidence,
            "video_info": video_info,
            "created_at_utc": _utc_now(),
        }
        write_json_atomic(incident_dir / "incident.json", incident)
        self._queue(
            insert_operation(
                "incidents",
                {
                    "id": incident_id,
                    "detection_id": detection_id,
                    "source_analysis_id": analysis_id,
                    "classification": incident["classification"],
                    "review_status": "pending_review",
                    "description": parsed["description"],
                    "uncertainty": parsed["uncertainty"],
                    "occurred_at": occurred_at(
                        session["recording_start_utc"], parsed["event_offset_seconds"]
                    ),
                    "location_source": "simulated",
                },
            )
        )
        for frame in evidence:
            artifact_key = frame.get("artifact_key", frame["role"])
            storage_path = f"incidents/{incident_id}/{artifact_key}.jpg"
            self._queue(upload_operation(storage_path, frame["path"]))
            self._queue(
                insert_operation(
                    "evidence",
                    {
                        "id": stable_id("evidence", incident_id, artifact_key),
                        "incident_id": incident_id,
                        "role": frame["role"],
                        "storage_path": storage_path,
                        "captured_at": frame["timestamp_utc"],
                        "offset_seconds": frame["offset_seconds"],
                        "sha256": frame["sha256"],
                        "extraction_method": frame["extraction_method"],
                        "metadata": {
                            **frame.get("metadata", {}),
                            **(
                                {
                                    "source_frame_id": stable_id(
                                        "evidence",
                                        incident_id,
                                        frame["metadata"]["source_frame_key"],
                                    )
                                }
                                if frame.get("metadata", {}).get("source_frame_key")
                                else {}
                            ),
                            "observation_id": frame.get("observation_id"),
                            "camera_recording_uri": frame["camera_recording_uri"],
                            "simulation_run_id": self.simulation_run_id,
                        },
                    },
                )
            )
        self._flush()
        return str((incident_dir / "incident.json").resolve()), evidence_status
