"""Command-line entry point for the video analytics scaffold."""

import argparse
from collections.abc import Sequence


def build_parser() -> argparse.ArgumentParser:
    """Build the service command-line parser."""
    return argparse.ArgumentParser(
        prog="video-analytics",
        description="TraceDump AI video analytics worker (scaffold)",
    )


def main(argv: Sequence[str] | None = None) -> int:
    """Validate CLI arguments without starting an unimplemented worker."""
    build_parser().parse_args(argv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
