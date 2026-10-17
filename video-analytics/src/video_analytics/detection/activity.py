"""Phase B motion, actor detection, association, and temporal segmentation."""

from __future__ import annotations

import json
import os
import tempfile
import time
import uuid
import warnings
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from ..xprotect.client import build_xprotect_uri
from ..xprotect.live_frames import LiveFrame

RELEVANT_CLASSES = {0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


def utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True, slots=True)
class DetectorConfig:
    history: int = 150
    var_threshold: float = 24.0
    detect_shadows: bool = True
    motion_width: int = 640
    motion_threshold: float = 0.001
    warmup_samples: int = 3
    model: str = "yolo11n.pt"
    confidence: float = 0.25
    image_size: int = 640
    fallback_detection_interval_seconds: float = 2.0
    box_motion_threshold: float = 0.025
    activity_gap_seconds: float = 2.0
    pre_context_seconds: float = 3.0
    post_context_seconds: float = 5.0
    stale_frame_seconds: float = 5.0
    max_debug_images: int = 100


@dataclass(frozen=True, slots=True)
class Detection:
    class_id: int
    class_name: str
    confidence: float
    box_xyxy: tuple[int, int, int, int]
    motion_overlap: float
    actively_moving: bool


@dataclass(frozen=True, slots=True)
class ActivityHit:
    timestamp_utc: str
    actor_classes: tuple[str, ...]
    motion_fraction: float
    max_actor_motion_overlap: float
    debug_image: str | None = None


@dataclass(frozen=True, slots=True)
class ActivitySession:
    id: str
    activity_start_utc: str
    activity_end_utc: str
    recording_start_utc: str
    recording_end_utc: str
    xprotect_uri: str
    hit_count: int
    actor_classes: tuple[str, ...]


def is_motion_hit(motion_fraction: float, *, threshold: float, warmed_up: bool) -> bool:
    return warmed_up and motion_fraction >= threshold


def box_motion_overlap(mask: np.ndarray, box_xyxy: tuple[int, int, int, int]) -> float:
    """Return the fraction of foreground pixels inside a clipped actor box."""
    height, width = mask.shape[:2]
    x1, y1, x2, y2 = box_xyxy
    x1, x2 = sorted((max(0, min(width, x1)), max(0, min(width, x2))))
    y1, y2 = sorted((max(0, min(height, y1)), max(0, min(height, y2))))
    if x2 <= x1 or y2 <= y1:
        return 0.0
    region = mask[y1:y2, x1:x2]
    return float(np.count_nonzero(region)) / float(region.size)


class ActivitySessionManager:
    def __init__(self, camera_id: str, config: DetectorConfig) -> None:
        self.camera_id = camera_id
        self.config = config
        self._start: datetime | None = None
        self._last_hit: datetime | None = None
        self._hit_count = 0
        self._classes: set[str] = set()
        self.sessions: list[ActivitySession] = []

    def observe(self, timestamp: datetime, hit: ActivityHit | None) -> list[ActivitySession]:
        completed: list[ActivitySession] = []
        if hit is not None:
            if self._start is None:
                self._start = timestamp
            self._last_hit = timestamp
            self._hit_count += 1
            self._classes.update(hit.actor_classes)
        elif (
            self._last_hit is not None
            and (timestamp - self._last_hit).total_seconds() > self.config.activity_gap_seconds
        ):
            completed.append(self._close())
        return completed

    def finalize(self) -> list[ActivitySession]:
        return [self._close()] if self._last_hit is not None else []

    def _close(self) -> ActivitySession:
        assert self._start is not None and self._last_hit is not None
        recording_start = self._start - timedelta(seconds=self.config.pre_context_seconds)
        recording_end = self._last_hit + timedelta(seconds=self.config.post_context_seconds)
        start_text = utc_text(recording_start)
        end_text = utc_text(recording_end)
        session = ActivitySession(
            id=str(uuid.uuid4()),
            activity_start_utc=utc_text(self._start),
            activity_end_utc=utc_text(self._last_hit),
            recording_start_utc=start_text,
            recording_end_utc=end_text,
            xprotect_uri=build_xprotect_uri(self.camera_id, start_text, end_text),
            hit_count=self._hit_count,
            actor_classes=tuple(sorted(self._classes)),
        )
        self.sessions.append(session)
        self._start = None
        self._last_hit = None
        self._hit_count = 0
        self._classes.clear()
        return session


class YoloActorDetector:
    def __init__(self, config: DetectorConfig) -> None:
        import torch
        from ultralytics import YOLO

        self.config = config
        self.device: str | int = 0 if torch.cuda.is_available() else "cpu"
        if self.device == "cpu":
            warnings.warn(
                "CUDA-enabled PyTorch is unavailable; YOLO11n is using CPU",
                RuntimeWarning,
                stacklevel=2,
            )
        self.model = YOLO(config.model)

    def predict(
        self, image: np.ndarray
    ) -> tuple[list[tuple[int, str, float, tuple[int, int, int, int]]], float]:
        started = time.monotonic()
        results = self.model.predict(
            source=image,
            conf=self.config.confidence,
            imgsz=self.config.image_size,
            classes=sorted(RELEVANT_CLASSES),
            device=self.device,
            verbose=False,
        )
        elapsed_ms = (time.monotonic() - started) * 1000.0
        found: list[tuple[int, str, float, tuple[int, int, int, int]]] = []
        for result in results:
            if result.boxes is None:
                continue
            boxes = result.boxes.xyxy.cpu().numpy()
            classes = result.boxes.cls.cpu().numpy()
            confidences = result.boxes.conf.cpu().numpy()
            for box, class_id_value, confidence in zip(boxes, classes, confidences, strict=False):
                class_id = int(class_id_value)
                if class_id not in RELEVANT_CLASSES:
                    continue
                x1, y1, x2, y2 = (int(round(value)) for value in box.tolist())
                found.append(
                    (class_id, RELEVANT_CLASSES[class_id], float(confidence), (x1, y1, x2, y2))
                )
        return found, elapsed_ms


@dataclass(slots=True)
class ActivityReport:
    camera_id: str
    camera_name: str
    detector_config: dict[str, Any]
    model_device: str
    frames_received: int = 0
    frames_processed: int = 0
    stale_frames_skipped: int = 0
    nonadvancing_frames_skipped: int = 0
    motion_hits: int = 0
    yolo_calls: int = 0
    detections: int = 0
    detection_class_counts: dict[str, int] = field(default_factory=dict)
    actor_motion_hits: int = 0
    debug_images_saved: int = 0
    motion_processing_ms_total: float = 0.0
    yolo_processing_ms_total: float = 0.0
    activity_hits: list[dict[str, Any]] = field(default_factory=list)
    activity_sessions: list[dict[str, Any]] = field(default_factory=list)

    def public_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["mean_motion_processing_ms"] = (
            self.motion_processing_ms_total / self.frames_processed
            if self.frames_processed
            else 0.0
        )
        result["mean_yolo_processing_ms"] = (
            self.yolo_processing_ms_total / self.yolo_calls if self.yolo_calls else 0.0
        )
        result["selected_recording_intervals"] = [
            {
                "session_id": session["id"],
                "start_utc": session["recording_start_utc"],
                "end_utc": session["recording_end_utc"],
                "xprotect_uri": session["xprotect_uri"],
            }
            for session in self.activity_sessions
        ]
        return result


class ActivityDetector:
    def __init__(
        self,
        camera_id: str,
        camera_name: str,
        debug_directory: Path,
        *,
        config: DetectorConfig | None = None,
        yolo: YoloActorDetector | None = None,
    ) -> None:
        self.config = config or DetectorConfig()
        self.yolo = yolo or YoloActorDetector(self.config)
        self.debug_directory = debug_directory
        self.motion = cv2.createBackgroundSubtractorMOG2(
            history=self.config.history,
            varThreshold=self.config.var_threshold,
            detectShadows=self.config.detect_shadows,
        )
        self.sessions = ActivitySessionManager(camera_id, self.config)
        self.report = ActivityReport(
            camera_id=camera_id,
            camera_name=camera_name,
            detector_config=asdict(self.config),
            model_device=str(self.yolo.device),
        )
        self._samples = 0
        self._last_timestamp: datetime | None = None
        self._last_yolo_timestamp: datetime | None = None

    def process(self, frame: LiveFrame, repeated: bool = False) -> None:
        self.report.frames_received += 1
        if repeated or (
            self._last_timestamp is not None and frame.timestamp_utc <= self._last_timestamp
        ):
            self.report.nonadvancing_frames_skipped += 1
            return
        if frame.source_age_ms > self.config.stale_frame_seconds * 1000.0:
            self.report.stale_frames_skipped += 1
            self._last_timestamp = frame.timestamp_utc
            return
        self._last_timestamp = frame.timestamp_utc
        self.report.frames_processed += 1
        self._samples += 1

        started = time.monotonic()
        scale = self.config.motion_width / frame.image.shape[1]
        motion_height = max(1, int(round(frame.image.shape[0] * scale)))
        resized = cv2.resize(
            frame.image, (self.config.motion_width, motion_height), interpolation=cv2.INTER_AREA
        )
        raw_mask = self.motion.apply(resized)
        foreground = np.where(raw_mask == 255, 255, 0).astype(np.uint8)
        motion_fraction = float(np.count_nonzero(foreground)) / float(foreground.size)
        self.report.motion_processing_ms_total += (time.monotonic() - started) * 1000.0
        significant_motion = is_motion_hit(
            motion_fraction,
            threshold=self.config.motion_threshold,
            warmed_up=self._samples > self.config.warmup_samples,
        )
        if significant_motion:
            self.report.motion_hits += 1

        fallback_due = (
            self._last_yolo_timestamp is None
            or (frame.timestamp_utc - self._last_yolo_timestamp).total_seconds()
            >= self.config.fallback_detection_interval_seconds
        )
        detections: list[Detection] = []
        if significant_motion or fallback_due:
            raw_detections, elapsed_ms = self.yolo.predict(frame.image)
            self.report.yolo_calls += 1
            self.report.yolo_processing_ms_total += elapsed_ms
            self._last_yolo_timestamp = frame.timestamp_utc
            full_mask = cv2.resize(
                foreground,
                (frame.image.shape[1], frame.image.shape[0]),
                interpolation=cv2.INTER_NEAREST,
            )
            for class_id, class_name, confidence, box in raw_detections:
                overlap = box_motion_overlap(full_mask, box)
                detections.append(
                    Detection(
                        class_id=class_id,
                        class_name=class_name,
                        confidence=confidence,
                        box_xyxy=box,
                        motion_overlap=overlap,
                        actively_moving=overlap >= self.config.box_motion_threshold,
                    )
                )
            self.report.detections += len(detections)
            for detection in detections:
                self.report.detection_class_counts[detection.class_name] = (
                    self.report.detection_class_counts.get(detection.class_name, 0) + 1
                )

        active = [detection for detection in detections if detection.actively_moving]
        debug_path = None
        if detections:
            debug_path = self._save_debug(frame, foreground, detections, motion_fraction)
        hit: ActivityHit | None = None
        if significant_motion and active:
            self.report.actor_motion_hits += 1
            hit = ActivityHit(
                timestamp_utc=utc_text(frame.timestamp_utc),
                actor_classes=tuple(sorted({detection.class_name for detection in active})),
                motion_fraction=motion_fraction,
                max_actor_motion_overlap=max(detection.motion_overlap for detection in active),
                debug_image=str(debug_path) if debug_path else None,
            )
            self.report.activity_hits.append(asdict(hit))
        completed = self.sessions.observe(frame.timestamp_utc, hit)
        self.report.activity_sessions.extend(asdict(session) for session in completed)

    def finalize(self) -> dict[str, Any]:
        self.report.activity_sessions.extend(
            asdict(session) for session in self.sessions.finalize()
        )
        return self.report.public_dict()

    def _save_debug(
        self,
        frame: LiveFrame,
        foreground: np.ndarray,
        detections: list[Detection],
        motion_fraction: float,
    ) -> Path | None:
        if self.report.debug_images_saved >= self.config.max_debug_images:
            return None
        self.debug_directory.mkdir(parents=True, exist_ok=True)
        annotated = frame.image.copy()
        for detection in detections:
            x1, y1, x2, y2 = detection.box_xyxy
            color = (0, 255, 0) if detection.actively_moving else (0, 165, 255)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{detection.class_name} {detection.confidence:.2f} motion={detection.motion_overlap:.3f}"
            cv2.putText(
                annotated, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1
            )
        cv2.putText(
            annotated,
            f"{utc_text(frame.timestamp_utc)} motion={motion_fraction:.4f}",
            (10, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
        )
        stamp = frame.timestamp_utc.strftime("%Y%m%dT%H%M%S_%fZ")
        path = self.debug_directory / f"activity_{stamp}.jpg"
        if not cv2.imwrite(str(path), annotated, [cv2.IMWRITE_JPEG_QUALITY, 90]):
            return None
        self.report.debug_images_saved += 1
        return path


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
