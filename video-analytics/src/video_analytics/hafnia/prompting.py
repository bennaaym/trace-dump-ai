"""Supply real recording bounds to prompts without changing the model's findings."""

from __future__ import annotations

import math


def recording_prompt(prompt: str, duration_seconds: float) -> str:
    if not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise ValueError("Recording duration must be finite and positive")
    return (
        prompt.rstrip()
        + "\n\nRecording context supplied by the acquisition worker: "
        + f"this selected interval is {duration_seconds:.3f} seconds long. "
        + "All non-null timestamps must be >= 0 and strictly less than this duration. "
        + "These bounds do not identify when an event occurred.\n"
    )
