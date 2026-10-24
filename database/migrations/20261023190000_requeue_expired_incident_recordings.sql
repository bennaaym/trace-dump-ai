-- Requeue retained derivatives whose deadline passed before worker cleanup.
-- Preserve operator authorization and reuse the existing incident-scoped row.
create or replace function public.request_incident_recording(p_incident_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    result_status text;
begin
    if not public.is_trace_dump_operator() then
        raise exception 'operator authorization is required' using errcode = '42501';
    end if;

    insert into public.incident_recordings (
        incident_id,
        recording_identity,
        status,
        requested_by,
        requested_at
    )
    select
        incident.id,
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
        auth.uid(),
        now()
    from public.incidents as incident
    join public.detections as detection on detection.id = incident.detection_id
    where incident.id = p_incident_id
    on conflict (incident_id) do update
    set
        status = case
            when (incident_recordings.status in ('failed', 'unavailable', 'expired')
                or (incident_recordings.status = 'available'
                    and incident_recordings.retention_expires_at <= now()))
                then 'pending'
            else incident_recordings.status
        end,
        requested_by = auth.uid(),
        requested_at = case
            when (incident_recordings.status in ('failed', 'unavailable', 'expired')
                or (incident_recordings.status = 'available'
                    and incident_recordings.retention_expires_at <= now()))
                then now()
            else incident_recordings.requested_at
        end,
        error_code = case
            when (incident_recordings.status in ('failed', 'unavailable', 'expired')
                or (incident_recordings.status = 'available'
                    and incident_recordings.retention_expires_at <= now()))
                then null
            else incident_recordings.error_code
        end
    returning status into result_status;

    if result_status is null then
        raise exception 'incident not found' using errcode = 'P0002';
    end if;
    return result_status;
end;
$$;
