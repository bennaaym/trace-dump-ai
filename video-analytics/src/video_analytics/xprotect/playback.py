"""Create a validated browser-compatible derivative from an XProtect export."""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4

from .video_export import VideoExportError, VideoProbe, probe_video


def transcode_browser_mp4(
    source: Path,
    destination: Path,
    *,
    expected_duration_seconds: float,
    threads: int = 1,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> VideoProbe:
    """Transcode to H.264/yuv420p fast-start MP4 and validate its duration."""
    if threads < 1 or threads > 4:
        raise ValueError("Playback transcode threads must be between 1 and 4")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise VideoExportError("ffmpeg was not found on PATH")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # A recording can be retried while another worker still owns an older
    # lease. Give every attempt its own output so those processes cannot move
    # or delete each other's partially completed derivative.
    temporary = destination.with_name(f".{destination.stem}.{uuid4().hex}.partial.mp4")
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        str(threads),
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-y",
        str(temporary),
    ]
    result = runner(command, capture_output=True, text=True, check=False, timeout=330)
    if result.returncode != 0:
        temporary.unlink(missing_ok=True)
        detail = (result.stderr or result.stdout).strip()
        if not detail:
            detail = f"ffmpeg exited with code {result.returncode} without diagnostic output"
        raise VideoExportError(f"Could not create browser playback MP4: {detail}")
    if not temporary.is_file():
        raise VideoExportError(
            "Could not create browser playback MP4: ffmpeg completed but its output file "
            "was unavailable"
        )
    try:
        probe = probe_video(temporary)
        validate_duration(probe.duration_seconds, expected_duration_seconds)
        os.replace(temporary, destination)
        return probe
    finally:
        temporary.unlink(missing_ok=True)


def validate_duration(actual: float, expected: float) -> None:
    if expected <= 0:
        raise VideoExportError("Stored recording interval has invalid duration")
    tolerance = max(1.0, expected * 0.1)
    if abs(actual - expected) > tolerance:
        raise VideoExportError(
            f"Playback duration mismatch (expected {expected:.3f}s, got {actual:.3f}s)"
        )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
