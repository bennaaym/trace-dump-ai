-- Queue a private browser-playable recording as part of incident creation.
-- Export/transcoding remains asynchronous in the playback worker.

create function public.queue_incident_recording()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.incident_recordings (
        incident_id,
        recording_identity,
        status,
        requested_by,
        requested_at
    )
    select
        new.id,
        encode(
            extensions.digest(
                detection.camera_id::text || '|' ||
                detection.recording_start_at::text || '|' ||
                detection.recording_end_at::text,
                'sha256'
            ),
            'hex'
        ),
        'pending',
        null,
        now()
    from public.detections as detection
    where detection.id = new.detection_id;

    return new;
end;
$$;

revoke all on function public.queue_incident_recording() from public;

create trigger incidents_queue_recording
after insert on public.incidents
for each row execute function public.queue_incident_recording();
