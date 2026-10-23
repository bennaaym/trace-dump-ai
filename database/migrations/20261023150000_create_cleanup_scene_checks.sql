-- Durable deadline scene checks, private follow-up evidence, and coordinator notifications.

alter table public.cleanup_cases
    add column resolution_source text,
    add constraint cleanup_cases_resolution_source_valid check (
        resolution_source is null or resolution_source in ('human', 'ai')
    );

update public.cleanup_cases
   set resolution_source = 'human'
 where status = 'resolved' and resolution_source is null;

alter table public.cleanup_cases
    drop constraint cleanup_cases_resolved_fields_consistent,
    add constraint cleanup_cases_resolved_fields_consistent check (
        (
            status = 'resolved'
            and resolution_outcome is not null
            and resolution_notes is not null
            and resolved_at is not null
            and resolution_source is not null
            and (resolution_source = 'ai' or resolved_by is not null)
        )
        or
        (
            status <> 'resolved'
            and resolution_outcome is null
            and resolution_notes is null
            and resolved_at is null
            and resolved_by is null
            and resolution_source is null
        )
    );

create table public.cleanup_scene_check_policies (
    camera_id uuid primary key references public.cameras (id)
        on update restrict on delete cascade,
    automatic_resolution_enabled boolean not null default false,
    confidence_policy_validated boolean not null default false,
    minimum_confidence double precision not null default 0.9,
    looping_source boolean not null default false,
    updated_at timestamptz not null default now(),
    constraint cleanup_scene_check_policy_safe check (
        not automatic_resolution_enabled
        or (confidence_policy_validated and not looping_source)
    ),
    constraint cleanup_scene_check_minimum_confidence_valid check (
        minimum_confidence > 0 and minimum_confidence <= 1
    )
);

create table public.cleanup_scene_checks (
    id uuid primary key default gen_random_uuid(),
    cleanup_case_id uuid not null references public.cleanup_cases (id)
        on update restrict on delete restrict,
    trigger_kind text not null default 'deadline',
    scheduled_for timestamptz not null,
    status text not null default 'scheduled',
    attempt_count integer not null default 0,
    max_attempts integer not null default 3,
    lease_owner text,
    lease_expires_at timestamptz,
    cancellation_requested boolean not null default false,
    reference_evidence_id uuid references public.evidence (id)
        on update restrict on delete restrict,
    snapshot_storage_path text,
    captured_at timestamptz,
    source_timestamp timestamptz,
    source_age_ms double precision,
    assessment text,
    grounded_observations jsonb not null default '[]'::jsonb,
    limitations jsonb not null default '[]'::jsonb,
    object_region_observable boolean,
    camera_reference_matched boolean,
    fresh_frame boolean,
    model_id text,
    model_version text,
    confidence double precision,
    hafnia_summary_id text,
    analysis_started_at timestamptz,
    analysis_completed_at timestamptz,
    error_code text,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint cleanup_scene_checks_trigger_valid check (
        trigger_kind in ('deadline', 'manual', 'retry')
    ),
    constraint cleanup_scene_checks_status_valid check (
        status in ('scheduled', 'running', 'completed', 'failed', 'cancelled', 'superseded')
    ),
    constraint cleanup_scene_checks_attempts_valid check (
        attempt_count >= 0 and max_attempts between 1 and 10 and attempt_count <= max_attempts
    ),
    constraint cleanup_scene_checks_assessment_valid check (
        assessment is null or assessment in ('still_visible', 'appears_cleared', 'uncertain')
    ),
    constraint cleanup_scene_checks_confidence_valid check (
        confidence is null or confidence between 0 and 1
    ),
    constraint cleanup_scene_checks_json_arrays check (
        jsonb_typeof(grounded_observations) = 'array'
        and jsonb_typeof(limitations) = 'array'
    ),
    constraint cleanup_scene_checks_storage_path_valid check (
        snapshot_storage_path is null
        or (
            snapshot_storage_path like ('scene-checks/' || cleanup_case_id::text || '/%')
            and snapshot_storage_path not like '%..%'
            and right(snapshot_storage_path, 4) = '.jpg'
        )
    ),
    constraint cleanup_scene_checks_source_age_valid check (
        source_age_ms is null or source_age_ms >= 0
    ),
    constraint cleanup_scene_checks_lease_consistent check (
        (status = 'running' and lease_owner is not null and lease_expires_at is not null)
        or status <> 'running'
    )
);

alter table public.cleanup_cases
    add column resolution_scene_check_id uuid,
    add constraint cleanup_cases_resolution_scene_check_fk
        foreign key (resolution_scene_check_id) references public.cleanup_scene_checks (id)
        on update restrict on delete restrict,
    add constraint cleanup_cases_ai_resolution_check_required check (
        resolution_source <> 'ai' or resolution_scene_check_id is not null
    );

create table public.cleanup_notifications (
    id uuid primary key default gen_random_uuid(),
    cleanup_case_id uuid not null references public.cleanup_cases (id)
        on update restrict on delete restrict,
    scene_check_id uuid not null references public.cleanup_scene_checks (id)
        on update restrict on delete restrict,
    kind text not null,
    deduplication_key text not null unique,
    title text not null,
    message text not null,
    created_at timestamptz not null default now(),
    read_at timestamptz,
    acknowledged_at timestamptz,
    acknowledged_by uuid references auth.users (id)
        on update restrict on delete restrict,
    constraint cleanup_notifications_kind_valid check (
        kind in ('still_visible', 'uncertain', 'capture_failed', 'analysis_failed')
    ),
    constraint cleanup_notifications_text_not_blank check (
        btrim(title) <> '' and btrim(message) <> ''
    ),
    constraint cleanup_notifications_ack_consistent check (
        (acknowledged_at is null and acknowledged_by is null)
        or (acknowledged_at is not null and acknowledged_by is not null)
    )
);

create unique index cleanup_scene_checks_one_scheduled_deadline_idx
    on public.cleanup_scene_checks (cleanup_case_id)
    where status = 'scheduled' and trigger_kind in ('deadline', 'retry');
create index cleanup_scene_checks_claim_idx
    on public.cleanup_scene_checks (scheduled_for, created_at)
    where status = 'scheduled';
create index cleanup_scene_checks_case_history_idx
    on public.cleanup_scene_checks (cleanup_case_id, created_at desc);
create unique index cleanup_scene_checks_one_scheduled_manual_idx
    on public.cleanup_scene_checks (cleanup_case_id)
    where status = 'scheduled' and trigger_kind = 'manual';
create index cleanup_notifications_attention_idx
    on public.cleanup_notifications (acknowledged_at, created_at desc);

create trigger cleanup_scene_check_policies_set_updated_at
before update on public.cleanup_scene_check_policies
for each row execute function public.set_updated_at();
create trigger cleanup_scene_checks_set_updated_at
before update on public.cleanup_scene_checks
for each row execute function public.set_updated_at();

alter table public.cleanup_scene_check_policies enable row level security;
alter table public.cleanup_scene_checks enable row level security;
alter table public.cleanup_notifications enable row level security;
revoke all on table public.cleanup_scene_check_policies, public.cleanup_scene_checks,
    public.cleanup_notifications from anon, authenticated;
grant select on table public.cleanup_scene_check_policies, public.cleanup_scene_checks,
    public.cleanup_notifications to authenticated;
create policy cleanup_scene_check_policies_operator_read
on public.cleanup_scene_check_policies for select to authenticated
using (public.is_trace_dump_operator());
create policy cleanup_scene_checks_operator_read
on public.cleanup_scene_checks for select to authenticated
using (public.is_trace_dump_operator());
create policy cleanup_notifications_operator_read
on public.cleanup_notifications for select to authenticated
using (public.is_trace_dump_operator());

insert into storage.buckets (id, name, public)
values ('cleanup-scene-checks', 'cleanup-scene-checks', false)
on conflict (id) do update set name = excluded.name, public = false;

create policy cleanup_scene_check_objects_operator_read
on storage.objects for select to authenticated
using (
    bucket_id = 'cleanup-scene-checks'
    and public.is_trace_dump_operator()
    and exists (
        select 1 from public.cleanup_scene_checks as scene_check
         where scene_check.snapshot_storage_path = storage.objects.name
    )
);

create function public.schedule_cleanup_scene_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    should_schedule boolean := false;
begin
    if new.status = 'resolved' then
        update public.cleanup_scene_checks
           set status = 'cancelled',
               cancellation_requested = true,
               error_code = coalesce(error_code, 'case_resolved'),
               error_message = coalesce(error_message, 'Cancelled because a human resolved the cleanup case.'),
               lease_owner = null,
               lease_expires_at = null
         where cleanup_case_id = new.id and status = 'scheduled';
        update public.cleanup_scene_checks
           set cancellation_requested = true
         where cleanup_case_id = new.id and status = 'running';
        return new;
    end if;

    if new.due_at is not null then
        if tg_op = 'INSERT' then
            should_schedule := true;
        elsif old.due_at is distinct from new.due_at
              or (old.status = 'resolved' and new.status <> 'resolved') then
            should_schedule := true;
        end if;
    end if;

    if should_schedule then
        update public.cleanup_scene_checks
           set status = 'superseded',
               cancellation_requested = true,
               lease_owner = null,
               lease_expires_at = null
         where cleanup_case_id = new.id and status = 'scheduled';
        update public.cleanup_scene_checks
           set cancellation_requested = true
         where cleanup_case_id = new.id and status = 'running';
        insert into public.cleanup_scene_checks (
            cleanup_case_id, trigger_kind, scheduled_for
        ) values (new.id, 'deadline', new.due_at);
    end if;
    return new;
end;
$$;

create trigger cleanup_cases_schedule_scene_check_insert
after insert on public.cleanup_cases
for each row execute function public.schedule_cleanup_scene_check();
create trigger cleanup_cases_schedule_scene_check_update
after update of due_at, status on public.cleanup_cases
for each row execute function public.schedule_cleanup_scene_check();

-- Existing assigned, unresolved cases receive one durable job when this migration is applied.
insert into public.cleanup_scene_checks (cleanup_case_id, trigger_kind, scheduled_for)
select id, 'deadline', due_at
  from public.cleanup_cases
 where status <> 'resolved' and due_at is not null
on conflict do nothing;

create or replace function public.claim_cleanup_scene_check(
    p_worker_id text,
    p_lease_seconds integer default 600
)
returns table (
    id uuid, cleanup_case_id uuid, incident_id uuid, camera_id uuid,
    camera_name text, camera_location_source text, due_at timestamptz,
    attempt_count integer, max_attempts integer, cancellation_requested boolean,
    incident_description text, reference_evidence_id uuid,
    reference_storage_path text, reference_role text, reference_metadata jsonb,
    automatic_resolution_enabled boolean, confidence_policy_validated boolean,
    minimum_confidence double precision, looping_source boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare claimed_id uuid;
begin
    if coalesce(btrim(p_worker_id), '') = '' or p_lease_seconds not between 30 and 3600 then
        raise exception 'Invalid scene-check lease request' using errcode = '22023';
    end if;

    -- Expired leases are retryable until their bounded attempt limit is reached.
    update public.cleanup_scene_checks
       set status = case when attempt_count < max_attempts then 'scheduled' else 'failed' end,
           scheduled_for = case when attempt_count < max_attempts then now() else scheduled_for end,
           trigger_kind = case when attempt_count < max_attempts then 'retry' else trigger_kind end,
           lease_owner = null,
           lease_expires_at = null,
           error_code = 'lease_expired',
           error_message = 'The previous worker lease expired.'
     where status = 'running' and lease_expires_at < now();

    select scene_check.id into claimed_id
      from public.cleanup_scene_checks as scene_check
      join public.cleanup_cases as cleanup_case on cleanup_case.id = scene_check.cleanup_case_id
     where scene_check.status = 'scheduled'
       and scene_check.scheduled_for <= now()
       and cleanup_case.status <> 'resolved'
       and not exists (
           select 1 from public.cleanup_scene_checks running
            where running.cleanup_case_id = scene_check.cleanup_case_id
              and running.status = 'running'
       )
     order by scene_check.scheduled_for, scene_check.created_at
     for update of scene_check skip locked
     limit 1;
    if claimed_id is null then return; end if;

    update public.cleanup_scene_checks
       set status = 'running', attempt_count = attempt_count + 1,
           lease_owner = p_worker_id,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           analysis_started_at = now(), cancellation_requested = false,
           error_code = null, error_message = null
     where cleanup_scene_checks.id = claimed_id;

    return query
    select sc.id, cc.id, cc.incident_id, camera.id, camera.name,
           camera.location_source, cc.due_at, sc.attempt_count, sc.max_attempts,
           sc.cancellation_requested, incident.description,
           reference.id, reference.storage_path, reference.role, reference.metadata,
           coalesce(policy.automatic_resolution_enabled, false),
           coalesce(policy.confidence_policy_validated, false),
           coalesce(policy.minimum_confidence, 0.9),
           (coalesce(policy.looping_source, false) or camera.location_source = 'simulated')
      from public.cleanup_scene_checks sc
      join public.cleanup_cases cc on cc.id = sc.cleanup_case_id
      join public.incidents incident on incident.id = cc.incident_id
      join public.detections detection on detection.id = incident.detection_id
      join public.cameras camera on camera.id = detection.camera_id
      left join public.cleanup_scene_check_policies policy on policy.camera_id = camera.id
      left join lateral (
          select evidence.id, evidence.storage_path, evidence.role, evidence.metadata
            from public.evidence evidence
           where evidence.incident_id = incident.id
             and evidence.role in ('after', 'event', 'representative')
           order by case evidence.role when 'after' then 0 when 'event' then 1 else 2 end,
                    evidence.created_at desc
           limit 1
      ) reference on true
     where sc.id = claimed_id;
end;
$$;

create function public.finish_cleanup_scene_check(
    p_check_id uuid,
    p_worker_id text,
    p_result jsonb
)
returns public.cleanup_scene_checks
language plpgsql
security definer
set search_path = ''
as $$
declare
    scene_check public.cleanup_scene_checks%rowtype;
    cleanup_case public.cleanup_cases%rowtype;
    requested_status text := coalesce(p_result ->> 'status', 'failed');
    result_status text := case
        when coalesce(p_result ->> 'status', 'failed') = 'retry' then 'scheduled'
        else coalesce(p_result ->> 'status', 'failed')
    end;
    result_assessment text := nullif(p_result ->> 'assessment', '');
    notification_kind text;
    policy_auto_resolution boolean := false;
    policy_confidence_validated boolean := false;
    policy_minimum_confidence double precision := 1.0;
    policy_looping_source boolean := true;
begin
    if requested_status not in ('completed', 'failed', 'retry') then
        raise exception 'Invalid scene-check completion status' using errcode = '22023';
    end if;
    select * into scene_check from public.cleanup_scene_checks
     where id = p_check_id for update;
    if not found or scene_check.status <> 'running' or scene_check.lease_owner <> p_worker_id then
        raise exception 'Scene check lease is no longer owned by this worker' using errcode = '40001';
    end if;
    if requested_status = 'retry' and scene_check.attempt_count >= scene_check.max_attempts then
        result_status := 'failed';
    end if;
    select * into cleanup_case from public.cleanup_cases
     where id = scene_check.cleanup_case_id for update;
    select coalesce(policy.automatic_resolution_enabled, false),
           coalesce(policy.confidence_policy_validated, false),
           coalesce(policy.minimum_confidence, 1.0),
           (coalesce(policy.looping_source, false) or camera.location_source = 'simulated')
      into policy_auto_resolution, policy_confidence_validated,
           policy_minimum_confidence, policy_looping_source
      from public.incidents incident
      join public.detections detection on detection.id = incident.detection_id
      join public.cameras camera on camera.id = detection.camera_id
      left join public.cleanup_scene_check_policies policy on policy.camera_id = camera.id
     where incident.id = cleanup_case.incident_id;

    if cleanup_case.status = 'resolved' or scene_check.cancellation_requested then
        update public.cleanup_scene_checks set
            status = 'cancelled', cancellation_requested = true,
            lease_owner = null, lease_expires_at = null,
            error_code = 'case_resolved',
            error_message = 'Result ignored because the cleanup case was resolved.'
        where id = scene_check.id returning * into scene_check;
        return scene_check;
    end if;

    update public.cleanup_scene_checks set
        status = result_status,
        scheduled_for = case
            when requested_status = 'retry'
                then now() + make_interval(secs => least(900, 30 * power(2, attempt_count - 1))::integer)
            else scheduled_for
        end,
        reference_evidence_id = nullif(p_result ->> 'reference_evidence_id', '')::uuid,
        snapshot_storage_path = nullif(p_result ->> 'snapshot_storage_path', ''),
        captured_at = nullif(p_result ->> 'captured_at', '')::timestamptz,
        source_timestamp = nullif(p_result ->> 'source_timestamp', '')::timestamptz,
        source_age_ms = nullif(p_result ->> 'source_age_ms', '')::double precision,
        assessment = result_assessment,
        grounded_observations = coalesce(p_result -> 'grounded_observations', '[]'::jsonb),
        limitations = coalesce(p_result -> 'limitations', '[]'::jsonb),
        object_region_observable = (p_result ->> 'object_region_observable')::boolean,
        camera_reference_matched = (p_result ->> 'camera_reference_matched')::boolean,
        fresh_frame = (p_result ->> 'fresh_frame')::boolean,
        model_id = nullif(p_result ->> 'model_id', ''),
        model_version = nullif(p_result ->> 'model_version', ''),
        confidence = nullif(p_result ->> 'confidence', '')::double precision,
        hafnia_summary_id = nullif(p_result ->> 'hafnia_summary_id', ''),
        analysis_completed_at = now(),
        error_code = nullif(p_result ->> 'error_code', ''),
        error_message = nullif(p_result ->> 'error_message', ''),
        lease_owner = null, lease_expires_at = null
    where id = scene_check.id returning * into scene_check;

    if result_status = 'completed' and result_assessment = 'appears_cleared'
       and policy_auto_resolution
       and policy_confidence_validated
       and nullif(p_result ->> 'confidence', '')::double precision
           >= policy_minimum_confidence
       and coalesce((p_result ->> 'fresh_frame')::boolean, false)
       and coalesce((p_result ->> 'camera_reference_matched')::boolean, false)
       and coalesce((p_result ->> 'object_region_observable')::boolean, false)
       and not policy_looping_source then
        update public.cleanup_cases set
            status = 'resolved', resolution_outcome = 'site_already_cleared',
            resolution_notes = 'Resolved by validated scene-check policy.',
            resolution_source = 'ai', resolution_scene_check_id = scene_check.id,
            resolved_at = now(), resolved_by = null
        where id = cleanup_case.id and status <> 'resolved';
        if found then
            insert into public.cleanup_case_history (
                cleanup_case_id, event_type, previous_status, new_status, notes
            ) values (
                cleanup_case.id, 'resolution', cleanup_case.status, 'resolved',
                'Resolved by validated AI scene check ' || scene_check.id::text || '.'
            );
        end if;
    elsif now() >= cleanup_case.due_at then
        notification_kind := case
            when result_assessment = 'still_visible' then 'still_visible'
            when result_status = 'failed' and coalesce(p_result ->> 'error_code', '') like 'capture_%'
                then 'capture_failed'
            when result_status = 'failed' then 'analysis_failed'
            else 'uncertain'
        end;
        insert into public.cleanup_notifications (
            cleanup_case_id, scene_check_id, kind, deduplication_key, title, message
        ) values (
            cleanup_case.id, scene_check.id, notification_kind,
            scene_check.id::text || ':' || notification_kind,
            'Attention required for cleanup case',
            case notification_kind
                when 'still_visible' then 'Waste remains visible after the cleanup deadline.'
                when 'capture_failed' then 'The follow-up camera frame could not be captured.'
                when 'analysis_failed' then 'The follow-up scene could not be analyzed.'
                else 'The follow-up scene assessment is uncertain.'
            end
        ) on conflict (deduplication_key) do nothing;
    end if;
    return scene_check;
end;
$$;

create function public.request_cleanup_scene_recheck(p_case_id uuid)
returns public.cleanup_scene_checks
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); current_case public.cleanup_cases%rowtype;
declare result public.cleanup_scene_checks%rowtype;
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    select * into current_case from public.cleanup_cases where id = p_case_id for update;
    if not found or current_case.status = 'resolved' then
        raise exception 'Only unresolved cleanup cases can be rechecked' using errcode = '22023';
    end if;
    select * into result from public.cleanup_scene_checks
     where cleanup_case_id = current_case.id
       and status = 'scheduled' and trigger_kind = 'manual'
     order by created_at desc limit 1;
    if found then return result; end if;
    insert into public.cleanup_scene_checks (cleanup_case_id, trigger_kind, scheduled_for)
    values (current_case.id, 'manual', now()) returning * into result;
    insert into public.cleanup_case_history (cleanup_case_id, actor_id, event_type, notes)
    values (current_case.id, actor, 'verification', 'Manual AI scene recheck requested.');
    return result;
end;
$$;

create function public.acknowledge_cleanup_notification(p_notification_id uuid)
returns public.cleanup_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid(); result public.cleanup_notifications%rowtype;
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    update public.cleanup_notifications set
        read_at = coalesce(read_at, now()), acknowledged_at = now(), acknowledged_by = actor
    where id = p_notification_id returning * into result;
    if not found then raise exception 'Notification not found' using errcode = 'P0002'; end if;
    return result;
end;
$$;

revoke all on function public.claim_cleanup_scene_check(text, integer),
    public.finish_cleanup_scene_check(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_cleanup_scene_check(text, integer),
    public.finish_cleanup_scene_check(uuid, text, jsonb) to service_role;
revoke all on function public.request_cleanup_scene_recheck(uuid),
    public.acknowledge_cleanup_notification(uuid) from public, anon, authenticated;
grant execute on function public.request_cleanup_scene_recheck(uuid),
    public.acknowledge_cleanup_notification(uuid) to authenticated;

-- Human resolution source is set inside the existing mutation transaction.
create function public.mark_human_cleanup_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status = 'resolved' and old.status <> 'resolved' and new.resolution_source is null then
        new.resolution_source := 'human';
    end if;
    return new;
end;
$$;
create trigger cleanup_cases_mark_human_resolution
before update of status on public.cleanup_cases
for each row execute function public.mark_human_cleanup_resolution();
