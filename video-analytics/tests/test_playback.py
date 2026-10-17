from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from video_analytics.xprotect.playback import transcode_browser_mp4, validate_duration
from video_analytics.xprotect.video_export import VideoExportError, VideoProbe


def test_transcode_uses_bounded_h264_fast_start(tmp_path, monkeypatch):
    source = tmp_path / "recording.avi"
    source.write_bytes(b"source")
    output = tmp_path / "recording.mp4"
    monkeypatch.setattr("shutil.which", lambda name: "ffmpeg.exe")
    monkeypatch.setattr(
        "video_analytics.xprotect.playback.probe_video",
        lambda path: VideoProbe(20.0, 160, {"streams": []}),
    )

    def runner(command, **kwargs):
        assert command[command.index("-threads") + 1] == "1"
        assert command[command.index("-c:v") + 1] == "libx264"
        assert command[command.index("-pix_fmt") + 1] == "yuv420p"
        assert command[command.index("-c:a") + 1] == "aac"
        assert command[command.index("-movflags") + 1] == "+faststart"
        assert kwargs["timeout"] == 330
        Path(command[-1]).write_bytes(b"mp4")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    probe = transcode_browser_mp4(
        source,
        output,
        expected_duration_seconds=20.0,
        runner=runner,
    )
    assert output.read_bytes() == b"mp4"
    assert probe.duration_seconds == 20.0


@pytest.mark.parametrize(("actual", "expected"), [(0.0, 20.0), (25.0, 20.0)])
def test_duration_mismatch_is_rejected(actual, expected):
    with pytest.raises(VideoExportError, match="duration mismatch"):
        validate_duration(actual, expected)


def test_zero_length_database_interval_is_rejected():
    with pytest.raises(VideoExportError, match="invalid duration"):
        validate_duration(1.0, 0.0)
