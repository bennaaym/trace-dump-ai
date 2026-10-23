"""Validation of original post-dumping evidence for scene checks."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np


def validate_discarded_object_reference(image_bytes: bytes, metadata: dict[str, Any]) -> bool:
    """Require a decodable image plus an explicit object visibility/region attestation."""
    if not image_bytes:
        return False
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        return False
    return (
        metadata.get("discarded_object_visible") is True
        or metadata.get("object_region") is not None
    )
