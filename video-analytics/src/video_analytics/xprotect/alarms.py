"""TraceDump event contract for native XProtect alarms."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum

from .client import XProtectClient, XProtectError

logger = logging.getLogger(__name__)


class AlarmSeverity(StrEnum):
    """Supported native XProtect alarm priorities for future assessment work."""

    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


ALARM_TITLE = "TraceDump AI — Suspected Dumping"
ALARM_DESCRIPTION = "AI-detected suspected dumping. Human review required."
ALARM_EVENT_TYPE_NAME = "TraceDump AI Suspected Dumping"
DEFAULT_ALARM_SEVERITY = AlarmSeverity.MEDIUM
_INCIDENT_TAG_PREFIX = "tracedump-incident:"


@dataclass(frozen=True, slots=True)
class AlarmPublication:
    incident_id: str
    event_id: str | None
    alarm_id: str | None
    status: str


class SuspectedDumpingEventPublisher:
    """Create a native XProtect alarm and optionally publish its analytics event."""

    def __init__(self, client: XProtectClient) -> None:
        self.client = client
        self._event_type_id: str | None = None
        self._priority_id: str | None = None

    def publish(
        self, *, incident_id: str, camera_id: str, occurred_at_utc: str
    ) -> AlarmPublication:
        tag = f"{_INCIDENT_TAG_PREFIX}{incident_id}"
        existing_alarm_id = self.client.find_alarm_id_by_tag(tag)
        if existing_alarm_id is not None:
            return AlarmPublication(
                incident_id=incident_id,
                event_id=None,
                alarm_id=existing_alarm_id,
                status="already_published",
            )
        priority_id = self._priority_id or self.client.get_alarm_priority_id(
            DEFAULT_ALARM_SEVERITY.value
        )
        self._priority_id = priority_id
        alarm_response = self.client.trigger_alarm(
            name=ALARM_TITLE,
            message=ALARM_DESCRIPTION,
            priority_id=priority_id,
            source=f"cameras/{camera_id}",
            occurred_at_utc=occurred_at_utc,
            tag=tag,
        )
        alarm_data = alarm_response.get("data") if isinstance(alarm_response, dict) else None
        alarm_id = alarm_data.get("id") if isinstance(alarm_data, dict) else None
        if not isinstance(alarm_id, str) or not alarm_id:
            raise XProtectError("XProtect accepted the alarm request without returning an alarm id")

        event_id: str | None = None
        try:
            event_type_id = self._event_type_id or self.client.get_analytics_event_id(
                ALARM_EVENT_TYPE_NAME
            )
            self._event_type_id = event_type_id
            event_response = self.client.trigger_event(
                event_type_id=event_type_id,
                source=f"cameras/{camera_id}",
                occurred_at_utc=occurred_at_utc,
                tag=tag,
            )
            event_data = event_response.get("data") if isinstance(event_response, dict) else None
            candidate_event_id = event_data.get("id") if isinstance(event_data, dict) else None
            event_id = candidate_event_id if isinstance(candidate_event_id, str) else None
        except (ValueError, XProtectError) as exc:
            logger.warning(
                "xprotect_dumping_event_optional_publish_failed incident_id=%s "
                "alarm_id=%s camera_id=%s error=%s",
                incident_id,
                alarm_id,
                camera_id,
                exc,
            )
        logger.info(
            "xprotect_dumping_alarm_published incident_id=%s event_id=%s alarm_id=%s "
            "camera_id=%s occurred_at_utc=%s severity=%s",
            incident_id,
            event_id,
            alarm_id,
            camera_id,
            occurred_at_utc,
            DEFAULT_ALARM_SEVERITY.value,
        )
        return AlarmPublication(
            incident_id=incident_id,
            event_id=event_id,
            alarm_id=alarm_id,
            status="published",
        )
