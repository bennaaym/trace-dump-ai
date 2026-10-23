"""Command-line interface for TraceDump camera discovery and Hafnia analysis."""

from __future__ import annotations

import argparse
import getpass
import json
import re
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import Settings, load_prompt
from .db.cameras import CameraSyncError, SupabaseCameraRepository, sync_cameras
from .db.client import SupabaseClient, SupabaseError
from .db.persistence import PendingSyncStore, SupabaseAnalysisRepository
from .detection.activity import ActivityDetector, DetectorConfig, write_json_atomic
from .hafnia.client import HafniaClient, HafniaError
from .models import Camera
from .workers.incident_pipeline import IncidentPipeline, SimulationStateStore
from .workers.playback import PlaybackWorker
from .xprotect.alarms import SuspectedDumpingEventPublisher
from .xprotect.client import (
    XProtectClient,
    XProtectError,
    build_xprotect_uri,
    validate_utc_timestamp,
)
from .xprotect.live_frames import (
    FrameAcquisitionError,
    acquire_for_duration,
    acquire_mip_for_duration,
    write_report_atomic,
)
from .xprotect.mip_live import MipLiveError
from .xprotect.video_export import VideoExportError, probe_video, run_mip_export


def _utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _secret(value: str | None, prompt: str) -> str:
    if value:
        return value
    if not sys.stdin.isatty():
        raise RuntimeError(f"Missing credential; set {prompt}")
    return getpass.getpass(f"{prompt}: ")


def _clients(settings: Settings) -> tuple[XProtectClient, HafniaClient]:
    if not settings.xprotect_username:
        raise RuntimeError("Missing credential; set XPROTECT_USERNAME")
    x_password = _secret(settings.xprotect_password, "XPROTECT_PASSWORD")
    h_password = _secret(settings.hafnia_password, "HAFNIA_GW_PASSWORD")
    return (
        XProtectClient(
            settings.xprotect_base_url,
            settings.xprotect_username,
            x_password,
            timeout=settings.request_timeout,
        ),
        HafniaClient(
            settings.hafnia_base_url,
            settings.hafnia_username,
            h_password,
            verify=settings.hafnia_tls_verify,
            timeout=settings.request_timeout,
        ),
    )


def _xprotect_client(settings: Settings) -> XProtectClient:
    if not settings.xprotect_username:
        raise RuntimeError("Missing credential; set XPROTECT_USERNAME")
    return XProtectClient(
        settings.xprotect_base_url,
        settings.xprotect_username,
        _secret(settings.xprotect_password, "XPROTECT_PASSWORD"),
        timeout=settings.request_timeout,
    )


def _hafnia_client(settings: Settings) -> HafniaClient:
    return HafniaClient(
        settings.hafnia_base_url,
        settings.hafnia_username,
        _secret(settings.hafnia_password, "HAFNIA_GW_PASSWORD"),
        verify=settings.hafnia_tls_verify,
        timeout=settings.request_timeout,
    )


def _resolve_camera(selector: str, cameras: list[Camera]) -> Camera:
    by_id = [camera for camera in cameras if camera.id.casefold() == selector.casefold()]
    if by_id:
        return by_id[0]
    if selector.isdigit():
        index = int(selector)
        if 1 <= index <= len(cameras):
            return cameras[index - 1]
        raise ValueError(f"Camera index must be between 1 and {len(cameras)}")
    matches = [camera for camera in cameras if camera.name.casefold() == selector.casefold()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise ValueError(f"Camera name is ambiguous: {selector}")
    raise ValueError(f"Camera not found: {selector}")


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _save_run(
    root: Path,
    camera: Camera,
    start: str,
    end: str,
    model: str,
    request: dict[str, Any],
    response: dict[str, Any],
    requested_at: str,
) -> Path:
    summary_id = response["Id"]
    safe_id = re.sub(r"[^A-Za-z0-9_.-]", "_", summary_id)
    directory = root / safe_id
    directory.mkdir(parents=True, exist_ok=True)
    _write_json(directory / "request.json", request)
    _write_json(directory / "response.json", response)
    metadata = {
        "CameraId": camera.id,
        "CameraName": camera.name,
        "RecordingStartUtc": start,
        "RecordingEndUtc": end,
        "HafniaModel": model,
        "SummaryId": summary_id,
        "RequestCreationTimeUtc": response.get("CreationTimeUtc", requested_at),
        "CompletionTimeUtc": response.get("LastUpdatedTimeUtc")
        if response.get("Progress") in {"Completed", "Failed"}
        else None,
        "FinalProcessingStatus": response.get("Progress"),
        "InferenceResponse": response.get("Response"),
    }
    _write_json(directory / "metadata.json", metadata)
    return directory


def command_cameras(settings: Settings, *, json_output: bool = False) -> int:
    cameras = _xprotect_client(settings).list_cameras()
    if json_output:
        print(json.dumps([asdict(camera) for camera in cameras], indent=2, ensure_ascii=False))
        return 0
    print("Available XProtect cameras:\n")
    for index, camera in enumerate(cameras, 1):
        state = " [disabled]" if camera.enabled is False else ""
        print(f"{index}. {camera.name}{state} ({camera.id})")
    return 0


def command_cameras_sync(settings: Settings, *, dry_run: bool, json_output: bool = False) -> int:
    if not settings.supabase_url:
        raise RuntimeError("Missing configuration; set SUPABASE_URL")
    if not settings.supabase_service_role_key:
        raise RuntimeError("Missing credential; set SUPABASE_SERVICE_ROLE_KEY")
    discovered = _xprotect_client(settings).list_cameras()
    repository = SupabaseCameraRepository(
        settings.supabase_url,
        settings.supabase_service_role_key,
        timeout=settings.request_timeout,
    )
    report = sync_cameras(discovered, repository, dry_run=dry_run)
    if json_output:
        print(json.dumps(report.to_dict(), indent=2, ensure_ascii=False))
    else:
        mode = "DRY RUN" if dry_run else "SYNC"
        print(f"Camera {mode}: {report.discovered} discovered\n")
        print("ACTION     ENABLED  COORDINATES             NAME (GUID)")
        for result in report.results:
            enabled = "yes" if result.enabled else "no" if result.enabled is not None else "-"
            if result.coordinate_state == "valid":
                coordinates = f"{result.latitude:.6f}, {result.longitude:.6f}"
            else:
                coordinates = f"null ({result.coordinate_state})"
            print(
                f"{result.action.upper():<10} {enabled:<8} {coordinates:<23} "
                f"{result.name} ({result.id})"
            )
            if result.error:
                print(f"  Error: {result.error}")
        counts = report.counts
        print(
            "\nSummary: "
            + ", ".join(f"{name}={count}" for name, count in counts.items())
            + f", duplicates={report.to_dict()['duplicates']}"
        )
        if dry_run:
            print("Dry run complete: no Supabase writes were made.")
    return 1 if report.counts["failed"] else 0


def command_check(settings: Settings) -> int:
    xprotect, hafnia = _clients(settings)
    cameras = xprotect.list_cameras()
    models = hafnia.list_models()
    print(f"XProtect authentication and discovery: OK ({len(cameras)} cameras)")
    print(f"Hafnia authentication and connectivity: OK ({len(models)} models)")
    model_ids = [model.get("Id") for model in models]
    if settings.hafnia_model not in model_ids:
        raise RuntimeError(f"Required Hafnia model is unavailable: {settings.hafnia_model}")
    print(f"Hafnia model {settings.hafnia_model}: available")
    return 0


def command_analyze(settings: Settings, args: argparse.Namespace) -> int:
    xprotect, hafnia = _clients(settings)
    cameras = xprotect.list_cameras()
    camera = _resolve_camera(args.camera, cameras)
    if camera.enabled is False:
        raise ValueError(f"Camera is disabled: {camera.name} ({camera.id})")
    uri = build_xprotect_uri(camera.id, args.start, args.end)
    prompt = load_prompt(settings.prompt_path)
    requested_at = _utc_now()
    request, created = hafnia.create_summary(prompt, uri, args.model or settings.hafnia_model)
    print(f"Summary ID: {created['Id']}")
    print(f"Status: {created['Progress']}")
    try:
        response = hafnia.wait_for_summary(
            created["Id"],
            interval=args.poll_interval,
            timeout=args.timeout,
            on_status=lambda state: print(f"Status: {state}"),
        )
    except HafniaError:
        try:
            response = hafnia.get_summary(created["Id"])
            _save_run(
                settings.runs_dir,
                camera,
                args.start,
                args.end,
                args.model or settings.hafnia_model,
                request,
                response,
                requested_at,
            )
        finally:
            raise
    directory = _save_run(
        settings.runs_dir,
        camera,
        args.start,
        args.end,
        args.model or settings.hafnia_model,
        request,
        response,
        requested_at,
    )
    print("\nAnalysis:\n")
    print(response.get("Response", ""))
    print(f"\nRaw result saved to {directory}")
    return 0


def command_export(settings: Settings, args: argparse.Namespace) -> int:
    xprotect = _xprotect_client(settings)
    camera = _resolve_camera(args.camera, xprotect.list_cameras())
    if camera.enabled is False:
        raise ValueError(f"Camera is disabled: {camera.name} ({camera.id})")
    # Reuse the URI validator for canonical GUID and strict UTC interval checks.
    build_xprotect_uri(camera.id, args.start, args.end)
    run_stamp = _utc_now().replace("-", "").replace(":", "")
    directory = settings.exports_dir / f"{run_stamp}_{camera.id}"
    print(f"Exporting {camera.name} ({camera.id}) through the XProtect MIP SDK...")
    output = run_mip_export(
        server=settings.xprotect_base_url,
        camera_id=camera.id,
        start=args.start,
        end=args.end,
        output_directory=directory,
        filename="recording.avi",
        on_progress=lambda progress: print(f"Export progress: {progress}%"),
    )
    probe = probe_video(output)
    requested_duration = (
        validate_utc_timestamp(args.end) - validate_utc_timestamp(args.start)
    ).total_seconds()
    metadata = {
        "CameraId": camera.id,
        "CameraName": camera.name,
        "RequestedStartUtc": args.start,
        "RequestedEndUtc": args.end,
        "RequestedDurationSeconds": requested_duration,
        "ExportedAtUtc": _utc_now(),
        "ExportFormat": "AVI",
        "ExportMethod": "Milestone MIP SDK AVIExporter",
        "ExportPath": str(output.resolve()),
        "MeasuredDurationSeconds": probe.duration_seconds,
        "VideoFrameCount": probe.frame_count,
        "Ffprobe": probe.raw,
    }
    _write_json(directory / "metadata.json", metadata)
    print(f"Exported clip: {output}")
    print(f"Duration: {probe.duration_seconds:.3f} seconds")
    print(f"Video frames: {probe.frame_count}")
    print(f"Metadata: {directory / 'metadata.json'}")
    return 0


def command_monitor(settings: Settings, args: argparse.Namespace) -> int:
    hafnia_enabled = bool(args.simulation_run or args.max_hafnia_requests)
    if args.dry_run and hafnia_enabled:
        raise ValueError("--dry-run cannot be combined with Hafnia submission options")
    if not args.dry_run and not hafnia_enabled:
        raise ValueError(
            "Monitoring requires --dry-run, or both --simulation-run and --max-hafnia-requests"
        )
    if hafnia_enabled and (not args.simulation_run or args.max_hafnia_requests <= 0):
        raise ValueError(
            "Hafnia monitoring requires both --simulation-run and a positive --max-hafnia-requests"
        )
    if hafnia_enabled and not args.detect:
        raise ValueError(
            "Hafnia monitoring requires --detect so intervals are selected automatically"
        )
    xprotect = _xprotect_client(settings)
    camera = _resolve_camera(args.camera, xprotect.list_cameras())
    if camera.enabled is False:
        raise ValueError(f"Camera is disabled: {camera.name} ({camera.id})")
    run_stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S_%fZ")
    run_directory = settings.exports_dir.parent / "monitoring" / camera.id / run_stamp
    detector: ActivityDetector | None = None
    if args.detect:
        detector = ActivityDetector(
            camera.id,
            camera.name,
            run_directory / "debug",
            config=DetectorConfig(model=args.yolo_model),
        )
    print(
        f"Monitoring {camera.name} ({camera.id}) via XProtect {args.source} source for {args.duration:g} seconds..."
    )
    if args.source == "mip":
        report = acquire_mip_for_duration(
            settings.xprotect_base_url,
            camera,
            duration_seconds=args.duration,
            target_fps=args.fps,
            width=args.width,
            height=args.height,
            on_frame=detector.process if detector else None,
        )
    else:
        report = acquire_for_duration(
            xprotect,
            camera,
            duration_seconds=args.duration,
            target_fps=args.fps,
            width=args.width,
            height=args.height,
            on_frame=detector.process if detector else None,
        )
    if detector:
        activity = detector.finalize()
        output = run_directory / "report.json"
        phase_result: dict[str, Any] | None = None
        if hafnia_enabled:
            if not settings.supabase_url:
                raise RuntimeError("Missing configuration; set SUPABASE_URL")
            if not settings.supabase_service_role_key:
                raise RuntimeError("Missing credential; set SUPABASE_SERVICE_ROLE_KEY")
            repository = SupabaseAnalysisRepository(
                SupabaseClient(
                    settings.supabase_url,
                    settings.supabase_service_role_key,
                    timeout=settings.request_timeout,
                ),
                PendingSyncStore(
                    settings.exports_dir.parent / "state" / "pending_supabase_sync.json"
                ),
            )
            pipeline = IncidentPipeline(
                server=settings.xprotect_base_url,
                camera=camera,
                hafnia=_hafnia_client(settings),
                prompt=load_prompt(settings.prompt_path),
                prompt_version=settings.prompt_path.stem,
                model_id=settings.hafnia_model,
                runs_root=settings.exports_dir.parent,
                simulation_run_id=args.simulation_run,
                state_store=SimulationStateStore(
                    settings.exports_dir.parent / "state" / "simulation_state.json"
                ),
                poll_interval=settings.poll_interval,
                poll_timeout=settings.poll_timeout,
                repository=repository,
                detector_metadata={
                    "detector": "MOG2+YOLO",
                    "detector_config": activity["detector_config"],
                    "model_device": activity["model_device"],
                },
                alarm_publisher=SuspectedDumpingEventPublisher(xprotect),
            )
            phase_result = pipeline.process(activity["activity_sessions"], args.max_hafnia_requests)
        write_json_atomic(
            output,
            {
                "phase": "C/D/E" if hafnia_enabled else "B",
                "dry_run": args.dry_run,
                "hafnia_requests": phase_result["requests_submitted"] if phase_result else 0,
                "dumping_assessment": "performed" if phase_result else "not_performed",
                "acquisition": report.public_dict(),
                "activity_detection": activity,
                "analysis_pipeline": phase_result,
            },
        )
    else:
        run_id = report.started_at_utc.replace("-", "").replace(":", "").replace(".", "")
        output = (
            settings.exports_dir.parent / "monitoring" / camera.id / f"acquisition_{run_id}.json"
        )
        write_report_atomic(output, report)
    print(
        f"Decoded frames: {report.decoded_frames} ({report.unique_frames} unique, {report.repeated_frames} repeated)"
    )
    if report.source_frames_received:
        print(f"Source frames received: {report.source_frames_received}")
    print(f"Achieved unique FPS: {report.achieved_unique_fps:.2f} (target {report.target_fps:.2f})")
    print(f"Timestamps advancing: {'yes' if report.timestamps_advancing else 'no'}")
    print(f"Frames changing: {'yes' if report.frames_changing else 'no'}")
    if args.source == "rest":
        print(f"Mean request latency: {report.mean_request_latency_ms:.1f} ms")
    else:
        print(f"Mean source age: {report.mean_source_age_ms:.1f} ms")
    print(f"Failures: {report.failures}")
    if detector:
        print(f"Motion hits: {activity['motion_hits']}")
        print(f"YOLO calls: {activity['yolo_calls']}")
        print(f"Actor-motion hits: {activity['actor_motion_hits']}")
        print(f"Activity sessions: {len(activity['activity_sessions'])}")
        for index, interval in enumerate(activity["selected_recording_intervals"], 1):
            print(f"Interval {index}: {interval['start_utc']} to {interval['end_utc']}")
        if phase_result:
            print(f"Hafnia requests submitted: {phase_result['requests_submitted']}")
            print(f"Repeat sessions suppressed: {phase_result['repeat_sessions_suppressed']}")
            for result in phase_result["results"]:
                print(f"Analysis result: {json.dumps(result, ensure_ascii=False)}")
        print(f"Phase {'C/D/E' if phase_result else 'B'} report: {output}")
    else:
        print(f"Acquisition report: {output}")
    return 0 if report.unique_frames > 0 and report.failures == 0 else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="TraceDump XProtect and Hafnia integration")
    sub = parser.add_subparsers(dest="command", required=True)
    cameras = sub.add_parser("cameras", help="discover XProtect cameras")
    cameras.add_argument(
        "--json", action="store_true", help="print all returned camera metadata as JSON"
    )
    cameras.add_argument("camera_action", nargs="?", choices=("sync",), help="camera operation")
    cameras.add_argument(
        "--dry-run", action="store_true", help="preview synchronization without Supabase writes"
    )
    sub.add_parser("check", help="check XProtect and Hafnia connectivity without inference")
    analyze = sub.add_parser(
        "analyze",
        help="analyze one recorded camera interval (costs one Hafnia request when completed)",
    )
    analyze.add_argument(
        "--camera", required=True, help="camera GUID, exact name, or displayed 1-based index"
    )
    analyze.add_argument(
        "--start", required=True, help="recording start as UTC ISO 8601 ending in Z"
    )
    analyze.add_argument("--end", required=True, help="recording end as UTC ISO 8601 ending in Z")
    analyze.add_argument("--model", help="Hafnia model ID (default from HAFNIA_MODEL)")
    analyze.add_argument(
        "--poll-interval", type=float, default=3.0, help="polling interval in seconds"
    )
    analyze.add_argument(
        "--timeout", type=float, default=600.0, help="maximum polling time in seconds"
    )
    export = sub.add_parser(
        "export", help="export one recorded camera interval to AVI using the MIP SDK"
    )
    export.add_argument(
        "--camera", required=True, help="camera GUID, exact name, or displayed 1-based index"
    )
    export.add_argument(
        "--start", required=True, help="recording start as UTC ISO 8601 ending in Z"
    )
    export.add_argument("--end", required=True, help="recording end as UTC ISO 8601 ending in Z")
    monitor = sub.add_parser(
        "monitor", help="monitor XProtect frames and optionally analyze one simulation run"
    )
    monitor.add_argument(
        "--camera", required=True, help="camera GUID, exact name, or displayed 1-based index"
    )
    monitor.add_argument(
        "--dry-run",
        action="store_true",
        help="required for monitoring; guarantees no Hafnia request",
    )
    monitor.add_argument(
        "--duration", type=float, default=60.0, help="monitoring duration in seconds"
    )
    monitor.add_argument("--fps", type=float, default=5.0, help="target sampling rate")
    monitor.add_argument("--width", type=int, default=1280, help="maximum JPEG width")
    monitor.add_argument("--height", type=int, default=720, help="maximum JPEG height")
    monitor.add_argument(
        "--detect", action="store_true", help="run Phase B MOG2 + YOLO activity detection"
    )
    monitor.add_argument(
        "--yolo-model", default="yolo11n.pt", help="Ultralytics YOLO model path or name"
    )
    monitor.add_argument(
        "--simulation-run",
        help="persistent simulation run ID; explicitly enables Hafnia with a request cap",
    )
    monitor.add_argument(
        "--max-hafnia-requests",
        type=int,
        default=0,
        help="maximum submissions in this invocation (0 disables Hafnia)",
    )
    monitor.add_argument(
        "--source",
        choices=("mip", "rest"),
        default="mip",
        help="live source (default: MIP JPEGLiveSource; REST is a low-rate diagnostic fallback)",
    )
    playback = sub.add_parser(
        "playback-worker",
        help="prepare queued private incident recordings without blocking camera monitoring",
    )
    playback.add_argument(
        "--once",
        action="store_true",
        help="process at most one queued recording and exit",
    )
    playback.add_argument(
        "--poll-interval",
        type=float,
        default=5.0,
        help="queue polling interval in seconds",
    )
    return parser


def command_playback_worker(settings: Settings, args: argparse.Namespace) -> int:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    if not settings.xprotect_username or not settings.xprotect_password:
        raise RuntimeError("XPROTECT_USERNAME and XPROTECT_PASSWORD are required")
    worker = PlaybackWorker(
        SupabaseClient(
            settings.supabase_url,
            settings.supabase_service_role_key,
            timeout=settings.request_timeout,
        ),
        xprotect_server=settings.xprotect_base_url,
        cache_root=settings.playback_cache_dir,
        retention_hours=settings.playback_retention_hours,
        transcode_threads=settings.playback_transcode_threads,
    )
    if args.once:
        processed = worker.process_once()
        print(json.dumps({"processed": processed}))
        return 0
    worker.run(poll_seconds=args.poll_interval)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings.from_env()
    try:
        if args.command == "cameras":
            if args.camera_action == "sync":
                return command_cameras_sync(settings, dry_run=args.dry_run, json_output=args.json)
            if args.dry_run:
                raise ValueError("--dry-run is only valid with 'cameras sync'")
            return command_cameras(settings, json_output=args.json)
        if args.command == "check":
            return command_check(settings)
        if args.command == "export":
            return command_export(settings, args)
        if args.command == "monitor":
            return command_monitor(settings, args)
        if args.command == "playback-worker":
            return command_playback_worker(settings, args)
        return command_analyze(settings, args)
    except (
        ValueError,
        RuntimeError,
        XProtectError,
        HafniaError,
        VideoExportError,
        FrameAcquisitionError,
        MipLiveError,
        CameraSyncError,
        SupabaseError,
        OSError,
    ) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
