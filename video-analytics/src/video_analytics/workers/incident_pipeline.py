"""Persistent Hafnia analysis and XProtect evidence extraction for closed sessions."""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from ..detection.activity import write_json_atomic
from ..evidence import extract_evidence_frames
from ..hafnia.client import HafniaClient, HafniaError
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
    if not value or "unknown" in value.casefold():
        return None
    clock = re.search(r"\b(\d{1,2}):(\d{2}(?:\.\d+)?)\b", value)
    if clock:
        return int(clock.group(1)) * 60 + float(clock.group(2))
    number = re.search(r"(?<!\d)(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b", value, re.I)
    return float(number.group(1)) if number else None


def parse_dumping_response(response: str) -> dict[str, Any]:
    detected_text = _field(response, "Dumping detected") or "Uncertain"
    detected_token = re.search(r"\b(yes|no|uncertain)\b", detected_text, re.I)
    classification = detected_token.group(1).lower() if detected_token else "uncertain"
    type_text = _field(response, "Dumping type") or "Unknown"
    type_token = re.search(r"\b(static|dynamic|unknown)\b", type_text, re.I)
    dumping_type = type_token.group(1).lower() if type_token else "unknown"
    event_text = _field(response, "Event timestamp")
    return {
        "classification": classification,
        "dumping_type": dumping_type,
        "event_timestamp_text": event_text,
        "event_offset_seconds": _event_seconds(event_text),
        "description": _field(response, "Sequence of events") or response.strip(),
        "people": _field(response, "People involved"),
        "vehicles": _field(response, "Vehicles involved"),
        "objects": _field(response, "Objects involved"),
        "evidence": _field(response, "Evidence"),
        "uncertainty": _field(response, "Uncertainties"),
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

    def process(self, sessions: list[dict[str, Any]], max_requests: int) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        requests_submitted = 0
        suppressed = 0
        for session in sessions:
            existing = self.state.get(self.simulation_run_id, self.camera.id)
            if existing and existing.get("status") == "submitted" and existing.get("summary_id"):
                try:
                    result = self._finish(existing["session"], existing["summary_id"], None)
                except Exception as exc:
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
            if requests_submitted >= max_requests:
                self.state.update(
                    self.simulation_run_id,
                    self.camera.id,
                    status="failed",
                    error="maximum Hafnia request count reached before submission",
                )
                results.append(
                    {
                        "status": "failed",
                        "error": "maximum Hafnia request count reached before submission",
                    }
                )
                continue
            end = validate_utc_timestamp(session["recording_end_utc"])
            wait_seconds = (end + timedelta(seconds=2) - datetime.now(UTC)).total_seconds()
            if wait_seconds > 0:
                time.sleep(wait_seconds)
            try:
                request, created = self.hafnia.create_summary(
                    self.prompt, session["xprotect_uri"], self.model_id
                )
                requests_submitted += 1
                summary_id = created["Id"]
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
                result = self._finish(session, summary_id, request)
            except Exception as exc:
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
        }

    def _finish(
        self, session: dict[str, Any], summary_id: str, request: dict[str, Any] | None
    ) -> dict[str, Any]:
        analysis_dir = self.runs_root / "analyses" / re.sub(r"[^A-Za-z0-9_.-]", "_", summary_id)
        analysis_dir.mkdir(parents=True, exist_ok=True)
        try:
            response = self.hafnia.wait_for_summary(
                summary_id, interval=self.poll_interval, timeout=self.poll_timeout
            )
        except HafniaError:
            try:
                response = self.hafnia.get_summary(summary_id)
                write_json_atomic(analysis_dir / "response.json", response)
            finally:
                raise
        write_json_atomic(analysis_dir / "response.json", response)
        raw_text = response.get("Response") or ""
        parsed = parse_dumping_response(raw_text)
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
        incident_path: str | None = None
        evidence_status = "not_requested"
        if parsed["classification"] == "yes":
            incident_path, evidence_status = self._create_incident(
                session, summary_id, response, parsed, analysis_dir
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
        }

    def _create_incident(
        self,
        session: dict[str, Any],
        summary_id: str,
        response: dict[str, Any],
        parsed: dict[str, Any],
        analysis_dir: Path,
    ) -> tuple[str, str]:
        incident_id = str(uuid.uuid4())
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
            evidence_status = "complete" if len(evidence) == 3 else "partial"
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
            else "dumping_unknown",
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
        return str((incident_dir / "incident.json").resolve()), evidence_status
