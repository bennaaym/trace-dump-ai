"""Python bridge for Milestone's supported MIP SDK JPEGLiveSource."""

from __future__ import annotations

import base64
import binascii
import os
import subprocess
from collections.abc import Iterator
from pathlib import Path

from ..models import XProtectJpeg
from .video_export import CSC_CANDIDATES, sdk_directory

HELPER_SOURCE = Path(__file__).with_name("mip_live_helper") / "Program.cs"
HELPER_EXE = Path(__file__).with_name("mip_live") / "TraceDump.MipLive.exe"
REQUIRED_ASSEMBLIES = (
    "VideoOS.Platform.dll",
    "VideoOS.Platform.SDK.dll",
    "VideoOS.Platform.SDK.Media.dll",
)


class MipLiveError(RuntimeError):
    """The supported MIP live-video bridge failed."""


def build_live_helper(*, runner=subprocess.run) -> Path:
    sdk_dir = sdk_directory()
    missing = [name for name in REQUIRED_ASSEMBLIES if not (sdk_dir / name).is_file()]
    if missing:
        raise MipLiveError(f"MIP live assemblies are missing from {sdk_dir}: {', '.join(missing)}")
    compiler = next((path for path in CSC_CANDIDATES if path.is_file()), None)
    if compiler is None:
        raise MipLiveError("The .NET Framework C# compiler was not found")
    if HELPER_EXE.is_file() and HELPER_EXE.stat().st_mtime >= HELPER_SOURCE.stat().st_mtime:
        return HELPER_EXE
    HELPER_EXE.parent.mkdir(parents=True, exist_ok=True)
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
        raise MipLiveError(f"Could not compile the MIP live helper: {detail}")
    return HELPER_EXE


def stream_live_jpegs(
    *,
    server: str,
    camera_id: str,
    width: int,
    height: int,
    fps: float,
    duration_seconds: float,
) -> Iterator[XProtectJpeg]:
    helper = build_live_helper()
    sdk_dir = sdk_directory()
    env = os.environ.copy()
    env["XPROTECT_MIPSDK_DIR"] = str(sdk_dir)
    env["PATH"] = str(sdk_dir) + os.pathsep + env.get("PATH", "")
    command = [
        str(helper),
        server,
        camera_id,
        str(width),
        str(height),
        str(max(1, round(fps))),
        format(duration_seconds, ".3f"),
    ]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=env,
    )
    assert process.stdout is not None
    try:
        for raw_line in process.stdout:
            line = raw_line.rstrip("\r\n")
            if not line.startswith("FRAME|"):
                continue
            try:
                _, timestamp, encoded = line.split("|", 2)
                jpeg = base64.b64decode(encoded, validate=True)
            except ValueError as exc:
                raise MipLiveError(
                    "MIP live helper FRAME protocol did not contain three fields "
                    f"(line_chars={len(line)}, separators={line.count('|')})"
                ) from exc
            except binascii.Error as exc:
                raise MipLiveError(
                    "MIP live helper FRAME payload was not valid base64 "
                    f"(line_chars={len(line)}, encoded_chars={len(encoded)})"
                ) from exc
            if not jpeg.startswith(b"\xff\xd8") or not jpeg.endswith(b"\xff\xd9"):
                raise MipLiveError(
                    "MIP live helper FRAME payload was not a complete JPEG "
                    f"(decoded_bytes={len(jpeg)})"
                )
            yield XProtectJpeg(camera_id=camera_id, frame_datetime=timestamp, jpeg_bytes=jpeg)
        return_code = process.wait(timeout=10)
        if return_code != 0:
            detail = process.stderr.read().strip() if process.stderr else ""
            raise MipLiveError(detail or f"MIP live helper exited with code {return_code}")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
