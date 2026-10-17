from video_analytics.cli import main


def test_cli_scaffold_exits_successfully() -> None:
    assert main([]) == 0
