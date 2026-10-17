from __future__ import annotations

import json
import subprocess

from video_analytics.xprotect.video_export import probe_video, run_mip_export


def test_probe_video_reports_duration_and_frame_count(tmp_path, monkeypatch):
    clip = tmp_path / "clip.mkv"
    clip.write_bytes(b"mock")
    payload = {
        "streams": [{"codec_type": "video", "nb_read_frames": "70"}],
        "format": {"duration": "14.000000"},
    }
    monkeypatch.setattr("shutil.which", lambda name: "ffprobe.exe")

    def runner(command, **kwargs):
        return subprocess.CompletedProcess(command, 0, stdout=json.dumps(payload), stderr="")

    result = probe_video(clip, runner=runner)
    assert result.duration_seconds == 14.0
    assert result.frame_count == 70
    assert result.raw == payload


def test_probe_video_retries_while_sdk_output_is_settling(tmp_path, monkeypatch):
    clip = tmp_path / "clip.avi"
    clip.write_bytes(b"mock")
    payload = {
        "streams": [{"codec_type": "video", "nb_read_frames": "93"}],
        "format": {"duration": "11.625000"},
    }
    monkeypatch.setattr("shutil.which", lambda name: "ffprobe.exe")
    calls = 0

    def runner(command, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return subprocess.CompletedProcess(
                command, 1, stdout="", stderr="file is still closing"
            )
        return subprocess.CompletedProcess(command, 0, stdout=json.dumps(payload), stderr="")

    result = probe_video(clip, runner=runner, attempts=2, retry_delay_seconds=0)
    assert calls == 2
    assert result.duration_seconds == 11.625
    assert result.frame_count == 93


def test_mip_export_passes_secrets_only_in_environment(tmp_path, monkeypatch):
    helper = tmp_path / "helper.exe"
    helper.write_bytes(b"mock")
    output = tmp_path / "recording.mkv"
    output.write_bytes(b"mock")
    monkeypatch.setattr(
        "video_analytics.xprotect.video_export.build_export_helper", lambda runner: helper
    )
    monkeypatch.setenv("XPROTECT_USERNAME", "basic-user")
    monkeypatch.setenv("XPROTECT_PASSWORD", "secret-value")

    def runner(command, **kwargs):
        assert "secret-value" not in command
        assert kwargs["env"]["XPROTECT_PASSWORD"] == "secret-value"
        return subprocess.CompletedProcess(
            command, 0, stdout=f"PROGRESS:100\nOUTPUT:{output}\n", stderr=""
        )

    result = run_mip_export(
        server="http://localhost",
        camera_id="c6725c10-958a-4819-a7fc-1fddaacd2f3e",
        start="2026-10-16T14:45:14Z",
        end="2026-10-16T14:45:28Z",
        output_directory=tmp_path,
        runner=runner,
    )
    assert result == output


def test_mip_export_keeps_completed_output_after_sdk_teardown_failure(tmp_path, monkeypatch):
    helper = tmp_path / "helper.exe"
    helper.write_bytes(b"mock")
    output = tmp_path / "recording.avi"
    output.write_bytes(b"completed SDK export")
    monkeypatch.setattr(
        "video_analytics.xprotect.video_export.build_export_helper", lambda runner: helper
    )

    def runner(command, **kwargs):
        return subprocess.CompletedProcess(
            command,
            0xC0000005,
            stdout=f"PROGRESS:100\nOUTPUT:{output}\n",
            stderr="",
        )

    assert (
        run_mip_export(
            server="http://localhost",
            camera_id="c6725c10-958a-4819-a7fc-1fddaacd2f3e",
            start="2026-10-16T14:45:14Z",
            end="2026-10-16T14:45:28Z",
            output_directory=tmp_path,
            filename="recording.avi",
            runner=runner,
        )
        == output
    )
