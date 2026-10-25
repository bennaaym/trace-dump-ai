"""Environment-based configuration. Secrets are never stored by this module."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_PATH = PROJECT_ROOT / ".env"
DEFAULT_PROMPT_PATH = Path(__file__).resolve().parent / "hafnia" / "prompts" / "dumping_v7.txt"
DEFAULT_RUNS_DIR = PROJECT_ROOT / "runs" / "hafnia"
DEFAULT_EXPORTS_DIR = PROJECT_ROOT / "runs" / "xprotect"
DEFAULT_PLAYBACK_CACHE_DIR = PROJECT_ROOT / "runs" / "playback"


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


@dataclass(frozen=True, slots=True)
class Settings:
    xprotect_base_url: str = "http://localhost"
    xprotect_username: str | None = None
    xprotect_password: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    hafnia_base_url: str = "https://localhost:15443"
    hafnia_username: str = "administrator"
    hafnia_password: str | None = None
    hafnia_tls_verify: bool | str = True
    hafnia_model: str = "traffic-general"
    request_timeout: float = 60.0
    poll_interval: float = 3.0
    poll_timeout: float = 600.0
    prompt_path: Path = DEFAULT_PROMPT_PATH
    runs_dir: Path = DEFAULT_RUNS_DIR
    exports_dir: Path = DEFAULT_EXPORTS_DIR
    playback_cache_dir: Path = DEFAULT_PLAYBACK_CACHE_DIR
    playback_retention_hours: int = 24
    playback_transcode_threads: int = 1
    simulation_poll_seconds: float = 3.0
    simulation_monitor_window_seconds: float = 20.0
    simulation_monitor_fps: float = 5.0
    simulation_yolo_model: str = ""
    simulation_acquisition_retries: int = 3
    simulation_recording_settle_seconds: float = 30.0
    scene_check_recording_settle_seconds: float = 30.0
    scene_check_clip_seconds: float = 60.0
    scene_source_adapter: str = "unavailable"
    scene_source_control_url: str | None = None
    scene_source_control_token: str | None = None
    scene_source_ready_timeout: float = 30.0

    @classmethod
    def from_env(cls, env_file: Path | str | None = None) -> Settings:
        # Existing process variables take precedence over values from .env.
        load_dotenv(dotenv_path=env_file or DEFAULT_ENV_PATH, override=False)
        ca_bundle = os.getenv("HAFNIA_CA_BUNDLE")
        verify: bool | str = ca_bundle if ca_bundle else _env_bool("HAFNIA_TLS_VERIFY", True)
        return cls(
            xprotect_base_url=os.getenv("XPROTECT_BASE_URL", "http://localhost").rstrip("/"),
            xprotect_username=os.getenv("XPROTECT_USERNAME"),
            xprotect_password=os.getenv("XPROTECT_PASSWORD"),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            hafnia_base_url=os.getenv("HAFNIA_BASE_URL", "https://localhost:15443").rstrip("/"),
            hafnia_username=os.getenv("HAFNIA_USERNAME", "administrator"),
            hafnia_password=os.getenv("HAFNIA_GW_PASSWORD"),
            hafnia_tls_verify=verify,
            hafnia_model=os.getenv("HAFNIA_MODEL", "traffic-general"),
            request_timeout=float(os.getenv("HTTP_TIMEOUT_SECONDS", "60")),
            poll_interval=float(os.getenv("HAFNIA_POLL_INTERVAL_SECONDS", "3")),
            poll_timeout=float(os.getenv("HAFNIA_POLL_TIMEOUT_SECONDS", "600")),
            prompt_path=Path(os.getenv("DUMPING_PROMPT_PATH", str(DEFAULT_PROMPT_PATH))),
            runs_dir=Path(os.getenv("TRACEDUMP_RUNS_DIR", str(DEFAULT_RUNS_DIR))),
            exports_dir=Path(os.getenv("TRACEDUMP_EXPORTS_DIR", str(DEFAULT_EXPORTS_DIR))),
            playback_cache_dir=Path(
                os.getenv("TRACEDUMP_PLAYBACK_CACHE_DIR", str(DEFAULT_PLAYBACK_CACHE_DIR))
            ),
            playback_retention_hours=int(os.getenv("TRACEDUMP_PLAYBACK_RETENTION_HOURS", "24")),
            playback_transcode_threads=int(os.getenv("TRACEDUMP_PLAYBACK_TRANSCODE_THREADS", "1")),
            simulation_poll_seconds=float(os.getenv("SIMULATION_POLL_SECONDS", "3")),
            simulation_monitor_window_seconds=float(
                os.getenv("SIMULATION_MONITOR_WINDOW_SECONDS", "20")
            ),
            simulation_monitor_fps=float(os.getenv("SIMULATION_MONITOR_FPS", "5")),
            simulation_yolo_model=os.getenv("SIMULATION_YOLO_MODEL", ""),
            simulation_acquisition_retries=int(os.getenv("SIMULATION_ACQUISITION_RETRIES", "3")),
            simulation_recording_settle_seconds=float(
                os.getenv("SIMULATION_RECORDING_SETTLE_SECONDS", "30")
            ),
            scene_check_recording_settle_seconds=float(
                os.getenv("SCENE_CHECK_RECORDING_SETTLE_SECONDS", "30")
            ),
            scene_check_clip_seconds=float(os.getenv("SCENE_CHECK_CLIP_SECONDS", "60")),
            scene_source_adapter=os.getenv("SCENE_SOURCE_ADAPTER", "unavailable"),
            scene_source_control_url=os.getenv("SCENE_SOURCE_CONTROL_URL"),
            scene_source_control_token=os.getenv("SCENE_SOURCE_CONTROL_TOKEN"),
            scene_source_ready_timeout=float(os.getenv("SCENE_SOURCE_READY_TIMEOUT_SECONDS", "30")),
        )


def load_prompt(path: Path) -> str:
    prompt = path.read_text(encoding="utf-8").strip()
    if not prompt:
        raise ValueError(f"Prompt file is empty: {path}")
    return prompt
