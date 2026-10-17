"""Supported XProtect recording export through Milestone's MIP .NET SDK."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_SDK_DIR = Path(r"C:\Program Files\Milestone\XProtect Mobile Server")
CSC_CANDIDATES = (
    Path(r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    Path(r"C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"),
)
HELPER_SOURCE = Path(__file__).with_name("mip_exporter_helper") / "Program.cs"
HELPER_EXE = Path(__file__).with_name("mip_exporter") / "TraceDump.MipExport.exe"
REQUIRED_ASSEMBLIES = (
    "VideoOS.Platform.dll",
    "VideoOS.Platform.SDK.dll",
    "VideoOS.Platform.SDK.Export.dll",
)


class VideoExportError(RuntimeError):
    """A supported MIP SDK export or media validation operation failed."""


@dataclass(frozen=True, slots=True)
class VideoProbe:
    duration_seconds: float
    frame_count: int
    raw: dict[str, Any]


def sdk_directory() -> Path:
    configured = os.getenv("XPROTECT_MIPSDK_DIR")
    return Path(configured) if configured else DEFAULT_SDK_DIR


def build_export_helper(
    *, runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run
) -> Path:
    sdk_dir = sdk_directory()
    missing = [name for name in REQUIRED_ASSEMBLIES if not (sdk_dir / name).is_file()]
    if missing:
        raise VideoExportError(
            f"MIP SDK export assemblies are missing from {sdk_dir}: {', '.join(missing)}"
        )
    compiler = next((path for path in CSC_CANDIDATES if path.is_file()), None)
    if compiler is None:
        raise VideoExportError("The .NET Framework C# compiler was not found")
    if HELPER_EXE.is_file() and HELPER_EXE.stat().st_mtime >= HELPER_SOURCE.stat().st_mtime:
        return HELPER_EXE
    command = [
        str(compiler),
        "/nologo",
        "/target:exe",
        "/platform:x64",
        f"/out:{HELPER_EXE}",
        *(f"/reference:{sdk_dir / name}" for name in REQUIRED_ASSEMBLIES),
        str(HELPER_SOURCE),
    ]
    result = runner(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise VideoExportError(f"Could not compile the MIP export helper: {detail}")
    if not HELPER_EXE.is_file():
        raise VideoExportError(
            "The MIP export helper compiler reported success but produced no executable"
        )
    return HELPER_EXE


def run_mip_export(
    *,
    server: str,
    camera_id: str,
    start: str,
    end: str,
    output_directory: Path,
    filename: str = "recording.mkv",
    on_progress: Callable[[int], None] | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> Path:
    helper = build_export_helper(runner=runner)
    output_directory.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    sdk_dir = sdk_directory()
    env["XPROTECT_MIPSDK_DIR"] = str(sdk_dir)
    env["PATH"] = str(sdk_dir) + os.pathsep + env.get("PATH", "")
    command = [
        str(helper),
        server,
        camera_id,
        start,
        end,
        str(output_directory.resolve()),
        filename,
    ]
    result = runner(command, capture_output=True, text=True, check=False, env=env, timeout=330)
    output: Path | None = None
    for line in result.stdout.splitlines():
        if line.startswith("PROGRESS:") and on_progress:
            with suppress(ValueError):
                on_progress(int(line.removeprefix("PROGRESS:")))
        elif line.startswith("OUTPUT:"):
            output = Path(line.removeprefix("OUTPUT:").strip())
    # Some MIP SDK installations terminate abnormally during process teardown
    # after EndExport/Close succeeded. OUTPUT is emitted only after both calls
    # and after the helper confirms the exported file exists, so retain it.
    if result.returncode != 0 and (output is None or not output.is_file()):
        detail = (result.stderr or result.stdout).strip()
        raise VideoExportError(detail or f"MIP export helper exited with code {result.returncode}")
    if output is None or not output.is_file():
        raise VideoExportError("MIP export completed without reporting a readable output file")
    return output


def probe_video(
    path: Path,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    attempts: int = 5,
    retry_delay_seconds: float = 1.0,
) -> VideoProbe:
    first = shutil.which("ffprobe")
    candidates: list[str] = []
    if first:
        candidates.append(first)
    executable_names = ("ffprobe.exe", "ffprobe") if os.name == "nt" else ("ffprobe",)
    for directory in os.get_exec_path():
        for name in executable_names:
            candidate = Path(directory) / name
            if candidate.is_file() and not any(
                os.path.normcase(str(candidate)) == os.path.normcase(existing)
                for existing in candidates
            ):
                candidates.append(str(candidate))
    if not candidates:
        raise VideoExportError("ffprobe was not found on PATH")
    result: subprocess.CompletedProcess[str] | None = None
    selected_command: list[str] | None = None
    attempt_count = max(1, attempts)
    for candidate_index, ffprobe in enumerate(candidates):
        command = [
            ffprobe,
            "-v",
            "error",
            "-count_frames",
            "-show_entries",
            "format=duration:stream=codec_type,nb_frames,nb_read_frames,duration",
            "-of",
            "json",
            str(path),
        ]
        for attempt in range(attempt_count):
            result = runner(command, capture_output=True, text=True, check=False)
            if result.returncode == 0:
                selected_command = command
                break
            # An empty diagnostic commonly means this ffprobe binary could not
            # load. Try the next PATH candidate instead of retrying it.
            if not (result.stderr or result.stdout).strip() and candidate_index + 1 < len(
                candidates
            ):
                break
            if attempt + 1 < attempt_count:
                time.sleep(retry_delay_seconds)
        if selected_command is not None:
            break
    assert result is not None
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise VideoExportError(
            f"ffprobe could not read the exported clip after trying {len(candidates)} binaries: {detail}"
        )
    try:
        payload = json.loads(result.stdout)
        video_stream = next(
            stream for stream in payload["streams"] if stream.get("codec_type") == "video"
        )
        duration = float(payload["format"]["duration"])
        frame_value = video_stream.get("nb_read_frames") or video_stream.get("nb_frames")
        frames = int(frame_value)
    except (KeyError, StopIteration, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise VideoExportError(
            "ffprobe did not return a valid video duration and frame count"
        ) from exc
    if duration <= 0 or frames <= 0:
        raise VideoExportError(
            f"Exported clip is not playable video (duration={duration}, frames={frames})"
        )
    return VideoProbe(duration_seconds=duration, frame_count=frames, raw=payload)
