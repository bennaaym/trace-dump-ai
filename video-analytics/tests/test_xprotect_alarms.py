from video_analytics.xprotect.alarms import (
    ALARM_DESCRIPTION,
    ALARM_EVENT_TYPE_NAME,
    ALARM_TITLE,
    DEFAULT_ALARM_SEVERITY,
    AlarmSeverity,
    SuspectedDumpingEventPublisher,
)


class RecordingClient:
    def __init__(self, existing_alarm_id=None):
        self.existing_alarm_id = existing_alarm_id
        self.calls = []

    def find_alarm_id_by_tag(self, tag):
        self.calls.append(("find_alarm", tag))
        return self.existing_alarm_id

    def get_analytics_event_id(self, name):
        self.calls.append(("get_event", name))
        return "d8b5a5a4-161d-42c0-bfb8-6a023d6f43e1"

    def trigger_event(self, **kwargs):
        self.calls.append(("trigger_event", kwargs))
        return {"data": {"id": "b4de0996-a3aa-4d2b-96a0-049f4eeac542"}}

    def get_alarm_priority_id(self, name):
        self.calls.append(("get_priority", name))
        return "9ad9338b-22ba-4f2e-bf62-e6948ae99bbf"

    def trigger_alarm(self, **kwargs):
        self.calls.append(("trigger_alarm", kwargs))
        return {"data": {"id": "cd865c62-4962-4861-b109-5f4f1172f09e"}}


def test_fixed_medium_contract_and_native_alarm_payload():
    client = RecordingClient()
    publisher = SuspectedDumpingEventPublisher(client)

    result = publisher.publish(
        incident_id="incident-1",
        camera_id="baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
        occurred_at_utc="2026-10-16T22:41:46.343Z",
    )

    assert set(AlarmSeverity) == {
        AlarmSeverity.LOW,
        AlarmSeverity.MEDIUM,
        AlarmSeverity.HIGH,
    }
    assert DEFAULT_ALARM_SEVERITY is AlarmSeverity.MEDIUM
    assert ("get_event", ALARM_EVENT_TYPE_NAME) in client.calls
    assert ("get_priority", "Medium") in client.calls
    alarm_call = next(value for operation, value in client.calls if operation == "trigger_alarm")
    assert alarm_call == {
        "name": ALARM_TITLE,
        "message": ALARM_DESCRIPTION,
        "priority_id": "9ad9338b-22ba-4f2e-bf62-e6948ae99bbf",
        "source": "cameras/baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
        "occurred_at_utc": "2026-10-16T22:41:46.343Z",
        "tag": "tracedump-incident:incident-1",
    }
    assert result.status == "published"


def test_existing_incident_alarm_suppresses_event_and_alarm_republication():
    existing = "cd865c62-4962-4861-b109-5f4f1172f09e"
    client = RecordingClient(existing_alarm_id=existing)
    publisher = SuspectedDumpingEventPublisher(client)

    result = publisher.publish(
        incident_id="incident-1",
        camera_id="baaba7e1-7e9d-4732-8f46-6612ffc9df1e",
        occurred_at_utc="2026-10-16T22:41:46.343Z",
    )

    assert result.status == "already_published"
    assert result.alarm_id == existing
    assert [operation for operation, _ in client.calls] == ["find_alarm"]
