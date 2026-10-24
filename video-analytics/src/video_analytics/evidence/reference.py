"""Validation of original post-dumping evidence for scene checks."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np


def validate_discarded_object_reference(
    image_bytes: bytes,
    metadata: dict[str, Any],
    *,
    role: str | None = None,
) -> bool:
    """Require a decodable post-event frame or explicit visibility attestation.

    Incident ``after`` evidence is extracted immediately after the positive
    dumping event and is the pipeline's canonical post-dumping reference.
    Older evidence rows predate the explicit visibility metadata, so their
    provenance is carried by that role instead.
    """
    if not image_bytes:
        return False
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        return False
    return (
        role == "after"
        or metadata.get("discarded_object_visible") is True
        or metadata.get("object_region") is not None
    )
