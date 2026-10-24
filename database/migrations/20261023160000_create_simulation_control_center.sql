-- Durable orchestration state for the operator-only Simulation Control Center.

create table public.simulation_monitoring_runs (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'queued',
    requested_by uuid not null references auth.users (id) on delete restrict,
    max_hafnia_requests integer not null default 6,
    hafnia_requests_reserved integer not null default 0,
    worker_id text,
    acknowledged_at timestamptz,
    started_at timestamptz,
    stop_requested_at timestamptz,
    stopped_at timestamptz,
    last_heartbeat_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint simulation_monitoring_runs_status_valid check (
        status in ('queued', 'starting', 'running', 'stopping', 'stopped', 'failed')
    ),
    constraint simulation_monitoring_runs_budget_valid check (
        max_hafnia_requests between 1 and 100
        and hafnia_requests_reserved between 0 and max_hafnia_requests
    )
);

create unique index simulation_one_active_run
on public.simulation_monitoring_runs ((true))
where status in ('queued', 'starting', 'running', 'stopping');

create table public.simulation_camera_monitors (
    run_id uuid not null references public.simulation_monitoring_runs (id) on delete cascade,
    camera_id uuid not null references public.cameras (id) on delete restrict,
    status text not null default 'idle',
    last_worker_activity_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (run_id, camera_id),
    constraint simulation_camera_monitors_status_valid check (
        status in ('idle', 'connecting', 'monitoring', 'activity_detected', 'analyzing', 'error', 'stopped')
    )
);

create table public.camera_scene_sources (
    id uuid primary key default gen_random_uuid(),
    camera_id uuid not null references public.cameras (id) on delete restrict,
    name text not null,
    description text,
    source_type text not null,
    source_reference text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint camera_scene_sources_name_not_blank check (btrim(name) <> ''),
    constraint camera_scene_sources_type_not_blank check (btrim(source_type) <> ''),
    constraint camera_scene_sources_reference_not_blank check (btrim(source_reference) <> ''),
    constraint camera_scene_sources_camera_name_unique unique (camera_id, name)
);

comment on column public.camera_scene_sources.source_reference is
    'Opaque identifier interpreted only by the configured server-side scene-source adapter; never a browser-supplied path.';

create table public.camera_scene_state (
    camera_id uuid primary key references public.cameras (id) on delete cascade,
    scene_source_id uuid references public.camera_scene_sources (id) on delete set null,
    status text not null default 'unknown',
    adapter_name text,
    backend_generation text,
    switch_requested_at timestamptz,
    verified_at timestamptz,
    xprotect_frame_at timestamptz,
    error_message text,
    updated_at timestamptz not null default now(),
    constraint camera_scene_state_status_valid check (
        status in ('unknown', 'switching', 'ready', 'error')
    )
);

create table public.simulation_worker_commands (
    id uuid primary key default gen_random_uuid(),
    kind text not null,
    status text not null default 'queued',
    run_id uuid references public.simulation_monitoring_runs (id) on delete cascade,
    cleanup_case_id uuid references public.cleanup_cases (id) on delete restrict,
    camera_id uuid references public.cameras (id) on delete restrict,
    scene_source_id uuid references public.camera_scene_sources (id) on delete restrict,
    requested_by uuid not null references auth.users (id) on delete restrict,
    worker_id text,
    lease_expires_at timestamptz,
    acknowledged_at timestamptz,
    completed_at timestamptz,
    result jsonb not null default '{}'::jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    constraint simulation_worker_commands_kind_valid check (
        kind in ('start_monitoring', 'stop_monitoring', 'switch_scene')
    ),
    constraint simulation_worker_commands_status_valid check (
        status in ('queued', 'claimed', 'completed', 'failed', 'cancelled')
    ),
    constraint simulation_worker_commands_result_object check (jsonb_typeof(result) = 'object')
);

create unique index simulation_one_pending_stop_per_run
on public.simulation_worker_commands (run_id, kind)
where kind = 'stop_monitoring' and status in ('queued', 'claimed');

create table public.simulation_worker_heartbeats (
    worker_id text primary key,
    started_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    version text not null,
    error_message text,
    constraint simulation_worker_heartbeats_worker_not_blank check (btrim(worker_id) <> ''),
    constraint simulation_worker_heartbeats_version_not_blank check (btrim(version) <> '')
);

alter table public.cleanup_scene_checks
    add column phase text not null default 'queued',
    add constraint cleanup_scene_checks_phase_valid check (
        phase in ('queued', 'capturing', 'preparing_comparison', 'analyzing',
                  'applying_decision', 'completed', 'failed', 'cancelled')
    );

update public.cleanup_scene_checks set phase = case
    when status = 'completed' then 'completed'
    when status = 'failed' then 'failed'
    when status in ('cancelled', 'superseded') then 'cancelled'
    else 'queued'
end;

create function public.sync_cleanup_scene_check_phase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status is distinct from old.status then
        new.phase := case
            when new.status = 'completed' then 'completed'
            when new.status = 'failed' then 'failed'
            when new.status in ('cancelled', 'superseded') then 'cancelled'
            when new.status = 'scheduled' then 'queued'
            else new.phase
        end;
    end if;
    return new;
end;
$$;

create trigger cleanup_scene_checks_sync_phase
before update of status on public.cleanup_scene_checks
for each row execute function public.sync_cleanup_scene_check_phase();

create trigger simulation_monitoring_runs_set_updated_at
before update on public.simulation_monitoring_runs
for each row execute function public.set_updated_at();
create trigger simulation_camera_monitors_set_updated_at
before update on public.simulation_camera_monitors
for each row execute function public.set_updated_at();
create trigger camera_scene_sources_set_updated_at
before update on public.camera_scene_sources
for each row execute function public.set_updated_at();
create trigger camera_scene_state_set_updated_at
before update on public.camera_scene_state
for each row execute function public.set_updated_at();

create function public.start_simulation_monitoring(p_max_hafnia_requests integer default 6)
returns public.simulation_monitoring_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    active_run public.simulation_monitoring_runs%rowtype;
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    if p_max_hafnia_requests not between 1 and 100 then
        raise exception 'Hafnia request cap must be between 1 and 100' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtext('trace_dump_simulation_monitoring'));
    select * into active_run from public.simulation_monitoring_runs
     where status in ('queued', 'starting', 'running', 'stopping')
     order by created_at desc limit 1;
    if found then return active_run; end if;
    if not exists (select 1 from public.cameras where enabled) then
        raise exception 'No enabled cameras are configured' using errcode = '22023';
    end if;
    insert into public.simulation_monitoring_runs (requested_by, max_hafnia_requests)
    values (actor, p_max_hafnia_requests) returning * into active_run;
    insert into public.simulation_camera_monitors (run_id, camera_id)
    select active_run.id, camera.id from public.cameras camera where camera.enabled;
    insert into public.simulation_worker_commands (kind, run_id, requested_by)
    values ('start_monitoring', active_run.id, actor);
    return active_run;
end;
$$;

create function public.stop_simulation_monitoring(p_run_id uuid)
returns public.simulation_monitoring_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    target public.simulation_monitoring_runs%rowtype;
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    select * into target from public.simulation_monitoring_runs where id = p_run_id for update;
    if not found then raise exception 'Monitoring run not found' using errcode = 'P0002'; end if;
    if target.status in ('stopped', 'failed') then return target; end if;
    update public.simulation_monitoring_runs
       set status = 'stopping', stop_requested_at = coalesce(stop_requested_at, now()), updated_at = now()
     where id = target.id returning * into target;
    insert into public.simulation_worker_commands (kind, run_id, requested_by)
    values ('stop_monitoring', target.id, actor)
    on conflict (run_id, kind) where kind = 'stop_monitoring' and status in ('queued', 'claimed')
    do nothing;
    return target;
end;
$$;

create function public.request_camera_scene_switch(p_cleanup_case_id uuid, p_scene_source_id uuid)
returns public.simulation_worker_commands
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    linked_camera_id uuid;
    requested_source public.camera_scene_sources%rowtype;
    command public.simulation_worker_commands%rowtype;
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    select detection.camera_id into linked_camera_id
      from public.cleanup_cases cleanup_case
      join public.incidents incident on incident.id = cleanup_case.incident_id
      join public.detections detection on detection.id = incident.detection_id
     where cleanup_case.id = p_cleanup_case_id and cleanup_case.status <> 'resolved'
     for share of cleanup_case;
    if linked_camera_id is null then
        raise exception 'Cleanup case is resolved or has no linked camera' using errcode = '22023';
    end if;
    select * into requested_source from public.camera_scene_sources
     where id = p_scene_source_id and camera_id = linked_camera_id and is_active;
    if not found then
        raise exception 'Scene source is inactive or does not belong to this camera' using errcode = '22023';
    end if;
    insert into public.camera_scene_state (camera_id, scene_source_id, status, switch_requested_at, error_message)
    values (linked_camera_id, requested_source.id, 'switching', now(), null)
    on conflict (camera_id) do update set
        scene_source_id = excluded.scene_source_id,
        status = 'switching', switch_requested_at = excluded.switch_requested_at,
        verified_at = null, xprotect_frame_at = null, error_message = null, updated_at = now();
    insert into public.simulation_worker_commands (
        kind, cleanup_case_id, camera_id, scene_source_id, requested_by
    ) values (
        'switch_scene', p_cleanup_case_id, linked_camera_id, requested_source.id, actor
    ) returning * into command;
    return command;
end;
$$;

create function public.claim_simulation_worker_command(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.simulation_worker_commands
language plpgsql
security definer
set search_path = ''
as $$
declare claimed_id uuid;
begin
    if coalesce(btrim(p_worker_id), '') = '' or p_lease_seconds not between 30 and 900 then
        raise exception 'Invalid worker lease request' using errcode = '22023';
    end if;
    update public.simulation_worker_commands set status = 'queued', worker_id = null, lease_expires_at = null
     where status = 'claimed' and lease_expires_at < now();
    select id into claimed_id from public.simulation_worker_commands
     where status = 'queued' order by created_at for update skip locked limit 1;
    if claimed_id is null then return; end if;
    return query
    update public.simulation_worker_commands set
        status = 'claimed', worker_id = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        acknowledged_at = now()
     where id = claimed_id returning *;
end;
$$;

create function public.finish_simulation_worker_command(
    p_command_id uuid, p_worker_id text, p_succeeded boolean, p_result jsonb default '{}'::jsonb,
    p_error_message text default null
)
returns public.simulation_worker_commands
language plpgsql
security definer
set search_path = ''
as $$
declare command public.simulation_worker_commands%rowtype;
begin
    update public.simulation_worker_commands set
        status = case when p_succeeded then 'completed' else 'failed' end,
        result = coalesce(p_result, '{}'::jsonb), error_message = p_error_message,
        completed_at = now(), lease_expires_at = null
     where id = p_command_id and status = 'claimed' and worker_id = p_worker_id
     returning * into command;
    if not found then raise exception 'Worker command lease is no longer owned' using errcode = '40001'; end if;
    return command;
end;
$$;

create function public.reserve_simulation_hafnia_request(p_run_id uuid, p_worker_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare reserved boolean;
begin
    update public.simulation_monitoring_runs set
        hafnia_requests_reserved = hafnia_requests_reserved + 1, updated_at = now()
     where id = p_run_id and worker_id = p_worker_id and status = 'running'
       and hafnia_requests_reserved < max_hafnia_requests
     returning true into reserved;
    return coalesce(reserved, false);
end;
$$;

-- Manual execution consumes the existing scheduled job when possible, so it cannot run again at its old deadline.
create or replace function public.request_cleanup_scene_recheck(p_case_id uuid)
returns public.cleanup_scene_checks
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    current_case public.cleanup_cases%rowtype;
    result public.cleanup_scene_checks%rowtype;
    linked_camera_id uuid;
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    select * into current_case from public.cleanup_cases where id = p_case_id for update;
    if not found or current_case.status = 'resolved' then
        raise exception 'Only unresolved cleanup cases can be rechecked' using errcode = '22023';
    end if;
    select detection.camera_id into linked_camera_id
      from public.incidents incident
      join public.detections detection on detection.id = incident.detection_id
     where incident.id = current_case.incident_id;
    if linked_camera_id is null then
        raise exception 'Cleanup case has no linked camera' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.camera_scene_sources
         where camera_id = linked_camera_id and is_active
    ) and not exists (
        select 1 from public.camera_scene_state state
        join public.camera_scene_sources source on source.id = state.scene_source_id
         where state.camera_id = linked_camera_id and state.status = 'ready'
           and state.verified_at > now() - interval '15 minutes'
           and source.camera_id = linked_camera_id and source.is_active
    ) then
        raise exception 'The controlled camera scene is not recently verified as ready' using errcode = '22023';
    end if;
    select * into result from public.cleanup_scene_checks
     where cleanup_case_id = current_case.id and status = 'running'
     order by created_at desc limit 1;
    if found then return result; end if;
    select * into result from public.cleanup_scene_checks
     where cleanup_case_id = current_case.id and status = 'scheduled'
     order by scheduled_for, created_at for update skip locked limit 1;
    if not found then
        raise exception 'No valid scheduled scene check exists for this case' using errcode = '22023';
    end if;
    update public.cleanup_scene_checks set
        trigger_kind = 'manual', scheduled_for = now(), phase = 'queued',
        error_code = null, error_message = null
     where id = result.id returning * into result;
    insert into public.cleanup_case_history (cleanup_case_id, actor_id, event_type, notes)
    values (current_case.id, actor, 'verification', 'Manual AI scene recheck requested.');
    return result;
end;
$$;

alter table public.simulation_monitoring_runs enable row level security;
alter table public.simulation_camera_monitors enable row level security;
alter table public.camera_scene_sources enable row level security;
alter table public.camera_scene_state enable row level security;
alter table public.simulation_worker_commands enable row level security;
alter table public.simulation_worker_heartbeats enable row level security;

revoke all on table public.simulation_monitoring_runs, public.simulation_camera_monitors,
    public.camera_scene_sources, public.camera_scene_state,
    public.simulation_worker_commands, public.simulation_worker_heartbeats from anon, authenticated;
grant select on table public.simulation_monitoring_runs, public.simulation_camera_monitors,
    public.camera_scene_state, public.simulation_worker_commands,
    public.simulation_worker_heartbeats to authenticated;
grant select (id, camera_id, name, description, source_type, is_active, created_at, updated_at)
on public.camera_scene_sources to authenticated;

create policy simulation_runs_operator_read on public.simulation_monitoring_runs
for select to authenticated using (public.is_trace_dump_operator());
create policy simulation_monitors_operator_read on public.simulation_camera_monitors
for select to authenticated using (public.is_trace_dump_operator());
create policy scene_sources_operator_read on public.camera_scene_sources
for select to authenticated using (public.is_trace_dump_operator());
create policy scene_state_operator_read on public.camera_scene_state
for select to authenticated using (public.is_trace_dump_operator());
create policy simulation_commands_operator_read on public.simulation_worker_commands
for select to authenticated using (public.is_trace_dump_operator());
create policy simulation_heartbeats_operator_read on public.simulation_worker_heartbeats
for select to authenticated using (public.is_trace_dump_operator());

revoke all on function public.start_simulation_monitoring(integer),
    public.stop_simulation_monitoring(uuid),
    public.request_camera_scene_switch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_simulation_monitoring(integer),
    public.stop_simulation_monitoring(uuid),
    public.request_camera_scene_switch(uuid, uuid) to authenticated;
revoke all on function public.claim_simulation_worker_command(text, integer),
    public.finish_simulation_worker_command(uuid, text, boolean, jsonb, text),
    public.reserve_simulation_hafnia_request(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_simulation_worker_command(text, integer),
    public.finish_simulation_worker_command(uuid, text, boolean, jsonb, text),
    public.reserve_simulation_hafnia_request(uuid, text) to service_role;
