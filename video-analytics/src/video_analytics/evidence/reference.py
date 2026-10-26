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
    """Require a decodable canonical incident frame or visibility attestation.

    The cleanup-check claim selects ``after``, ``event``, then
    ``representative`` evidence in that order. All three are canonical incident
    records and older rows legitimately lack the newer visibility metadata.
    Requiring metadata for the latter two silently prevents a valid comparison
    from reaching Hafnia, even though the stored frame is the selected incident
    reference.
    """
    if not image_bytes:
        return False
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        return False
    return (
        role in {"after", "event", "representative"}
        or metadata.get("discarded_object_visible") is True
        or metadata.get("object_region") is not None
    )
