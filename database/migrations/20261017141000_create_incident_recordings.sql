-- On-demand, private browser-playable derivatives of original XProtect recordings.
-- Original recordings remain in XProtect; this table stores preparation state and provenance.

create table public.incident_recordings (
    incident_id uuid primary key,
    recording_identity text not null unique,
    status text not null default 'pending',
    storage_path text unique,
    content_type text,
    duration_seconds double precision,
    sha256 text,
    requested_by uuid,
    requested_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    retention_expires_at timestamptz,
    lease_owner text,
    lease_expires_at timestamptz,
    attempt_count integer not null default 0,
    error_code text,
    provenance jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint incident_recordings_incident_fk
        foreign key (incident_id) references public.incidents (id)
        on update restrict on delete cascade,
    constraint incident_recordings_requester_fk
        foreign key (requested_by) references auth.users (id)
        on update restrict on delete set null,
    constraint incident_recordings_status_valid
        check (status in ('pending', 'preparing', 'available', 'unavailable', 'failed', 'expired')),
    constraint incident_recordings_identity_valid
        check (recording_identity ~ '^[0-9a-f]{64}$'),
    constraint incident_recordings_storage_path_valid
        check (
            storage_path is null
            or (
                storage_path like ('incidents/' || incident_id::text || '/%')
                and storage_path not like '%..%'
                and right(storage_path, 4) = '.mp4'
            )
        ),
    constraint incident_recordings_available_complete
        check (
            status <> 'available'
            or (
                storage_path is not null
                and content_type = 'video/mp4'
                and duration_seconds > 0
                and sha256 ~ '^[0-9a-f]{64}$'
                and completed_at is not null
                and retention_expires_at is not null
            )
        ),
    constraint incident_recordings_duration_valid
        check (duration_seconds is null or duration_seconds > 0),
    constraint incident_recordings_attempt_count_valid
        check (attempt_count >= 0),
    constraint incident_recordings_provenance_object
        check (jsonb_typeof(provenance) = 'object')
);

comment on table public.incident_recordings is
    'On-demand cached MP4 derivatives for authorized investigation playback; never the original XProtect recording.';
comment on column public.incident_recordings.recording_identity is
    'SHA-256 of the persisted camera ID and exact UTC recording interval.';
comment on column public.incident_recordings.retention_expires_at is
    'Worker cleanup deadline for the cached private derivative.';

create trigger incident_recordings_set_updated_at
before update on public.incident_recordings
for each row execute function public.set_updated_at();

create index incident_recordings_worker_queue_idx
    on public.incident_recordings (status, requested_at)
    where status in ('pending', 'preparing');

alter table public.incident_recordings enable row level security;
revoke all on table public.incident_recordings from anon, authenticated;

create function public.request_incident_recording(p_incident_id uuid)
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
            when incident_recordings.status in ('failed', 'unavailable', 'expired')
                then 'pending'
            else incident_recordings.status
        end,
        requested_by = auth.uid(),
        requested_at = case
            when incident_recordings.status in ('failed', 'unavailable', 'expired')
                then now()
            else incident_recordings.requested_at
        end,
        error_code = case
            when incident_recordings.status in ('failed', 'unavailable', 'expired')
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

create function public.get_incident_recording_access(p_incident_id uuid)
returns table (
    status text,
    storage_path text,
    content_type text,
    duration_seconds double precision,
    requested_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    retention_expires_at timestamptz,
    error_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_trace_dump_operator() then
        raise exception 'operator authorization is required' using errcode = '42501';
    end if;
    if not exists (select 1 from public.incidents where id = p_incident_id) then
        raise exception 'incident not found' using errcode = 'P0002';
    end if;
    return query
    select
        recording.status,
        recording.storage_path,
        recording.content_type,
        recording.duration_seconds,
        recording.requested_at,
        recording.started_at,
        recording.completed_at,
        recording.retention_expires_at,
        recording.error_code
    from public.incident_recordings as recording
    where recording.incident_id = p_incident_id;
end;
$$;

create function public.claim_incident_recording(
    p_worker_id text,
    p_lease_seconds integer default 600
)
returns table (
    incident_id uuid,
    recording_identity text,
    camera_id uuid,
    recording_start_at timestamptz,
    recording_end_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'service role required' using errcode = '42501';
    end if;
    if btrim(coalesce(p_worker_id, '')) = '' or p_lease_seconds not between 60 and 3600 then
        raise exception 'invalid worker lease';
    end if;

    return query
    with candidate as (
        select recording.incident_id
        from public.incident_recordings as recording
        where recording.status = 'pending'
           or (
               recording.status = 'preparing'
               and recording.lease_expires_at < now()
           )
        order by recording.requested_at
        for update skip locked
        limit 1
    ),
    claimed as (
        update public.incident_recordings as recording
        set
            status = 'preparing',
            started_at = now(),
            lease_owner = p_worker_id,
            lease_expires_at = now() + make_interval(secs => p_lease_seconds),
            attempt_count = recording.attempt_count + 1,
            error_code = null
        from candidate
        where recording.incident_id = candidate.incident_id
        returning recording.incident_id, recording.recording_identity
    )
    select
        claimed.incident_id,
        claimed.recording_identity,
        detection.camera_id,
        detection.recording_start_at,
        detection.recording_end_at
    from claimed
    join public.incidents as incident on incident.id = claimed.incident_id
    join public.detections as detection on detection.id = incident.detection_id;
end;
$$;

revoke all on function public.request_incident_recording(uuid) from public;
revoke all on function public.get_incident_recording_access(uuid) from public;
revoke all on function public.claim_incident_recording(text, integer) from public;
grant execute on function public.request_incident_recording(uuid) to authenticated;
grant execute on function public.get_incident_recording_access(uuid) to authenticated;
grant execute on function public.claim_incident_recording(text, integer) to service_role;

insert into storage.buckets (id, name, public)
values ('incident-recordings', 'incident-recordings', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

create function public.can_read_incident_recording_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_trace_dump_operator()
       and exists (
           select 1
           from public.incident_recordings as recording
           where recording.storage_path = p_storage_path
             and recording.status = 'available'
             and recording.retention_expires_at > now()
       );
$$;

revoke all on function public.can_read_incident_recording_object(text) from public;
grant execute on function public.can_read_incident_recording_object(text) to authenticated;

create policy incident_recordings_operator_read
on storage.objects
for select
to authenticated
using (
    bucket_id = 'incident-recordings'
    and public.can_read_incident_recording_object(storage.objects.name)
);
