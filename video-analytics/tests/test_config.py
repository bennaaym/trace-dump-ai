from __future__ import annotations

from video_analytics.config import Settings


def test_settings_load_credentials_from_dotenv(tmp_path, monkeypatch):
    for name in (
        "XPROTECT_USERNAME",
        "XPROTECT_PASSWORD",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "HAFNIA_GW_PASSWORD",
    ):
        monkeypatch.delenv(name, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "XPROTECT_USERNAME=dotenv-user\n"
        "XPROTECT_PASSWORD=dotenv-xprotect-secret\n"
        "SUPABASE_URL=https://example.supabase.co\n"
        "SUPABASE_SERVICE_ROLE_KEY=server-only-secret\n"
        "HAFNIA_GW_PASSWORD=dotenv-hafnia-secret\n",
        encoding="utf-8",
    )

    settings = Settings.from_env(env_file)

    assert settings.xprotect_username == "dotenv-user"
    assert settings.xprotect_password == "dotenv-xprotect-secret"
    assert settings.supabase_url == "https://example.supabase.co"
    assert settings.supabase_service_role_key == "server-only-secret"
    assert settings.hafnia_password == "dotenv-hafnia-secret"


def test_process_environment_overrides_dotenv(tmp_path, monkeypatch):
    monkeypatch.setenv("XPROTECT_USERNAME", "process-user")
    env_file = tmp_path / ".env"
    env_file.write_text("XPROTECT_USERNAME=dotenv-user\n", encoding="utf-8")

    settings = Settings.from_env(env_file)

    assert settings.xprotect_username == "process-user"
