-- Post-confirmation case workflow: a human-confirmed incident becomes a case
-- with an owner, a next action, a status lifecycle and an append-only audit trail.
-- Open -> Assigned -> In progress -> Resolved.

create table public.cases (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null,
    status text not null default 'open',
    next_action text,
    owner_id uuid,
    resolution_notes text,
    opened_at timestamptz not null default now(),
    assigned_at timestamptz,
    started_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint cases_incident_unique unique (incident_id),
    constraint cases_incident_fk
        foreign key (incident_id) references public.incidents (id)
        on update restrict on delete restrict,
    constraint cases_owner_fk
        foreign key (owner_id) references auth.users (id)
        on update restrict on delete restrict,
    constraint cases_status_valid
        check (status in ('open', 'assigned', 'in_progress', 'resolved')),
    constraint cases_next_action_valid
        check (next_action is null or next_action in ('cleanup', 'further_investigation', 'enforcement_referral')),
    constraint cases_assigned_has_owner_and_action
        check (status = 'open' or (owner_id is not null and next_action is not null)),
    constraint cases_resolved_complete
        check (
            status <> 'resolved'
            or (resolved_at is not null and nullif(btrim(coalesce(resolution_notes, '')), '') is not null)
        ),
    constraint cases_updated_after_created
        check (updated_at >= created_at)
);

comment on table public.cases is
    'Investigation case opened automatically when an operator confirms an incident.';
comment on column public.cases.owner_id is
    'Operator responsible for the case. Reassign the case before deleting the user account.';

create table public.case_events (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null,
    actor_id uuid,
    event_type text not null,
    from_status text,
    to_status text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint case_events_case_fk
        foreign key (case_id) references public.cases (id)
        on update restrict on delete restrict,
    constraint case_events_type_valid
        check (event_type in (
            'case_opened',
            'assignment_updated',
            'status_changed',
            'incident_review_changed',
            'report_generated'
        )),
    constraint case_events_details_object
        check (jsonb_typeof(details) = 'object')
);

comment on table public.case_events is
    'Append-only audit trail of case actions. A null actor_id means the system recorded the event.';

create index cases_status_idx on public.cases (status, opened_at);
create index cases_owner_idx on public.cases (owner_id) where owner_id is not null;
create index case_events_case_idx on public.case_events (case_id, created_at);

create trigger cases_set_updated_at
before update on public.cases
for each row execute function public.set_updated_at();

create function public.protect_case_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.incident_id is distinct from old.incident_id
       or new.opened_at is distinct from old.opened_at
       or new.created_at is distinct from old.created_at then
        raise exception 'Case incident and opening time are immutable';
    end if;
    return new;
end;
$$;

create trigger cases_protect_identity
before update on public.cases
for each row execute function public.protect_case_identity();

create function public.reject_case_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'Case events are append-only';
end;
$$;

create trigger case_events_append_only
before update or delete on public.case_events
for each row execute function public.reject_case_event_mutation();

-- Confirming an incident opens its case; later review changes are audited on it.
create or replace function public.sync_incident_review_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    opened_case_id uuid;
    existing_case_id uuid;
begin
    update public.incidents
       set review_status = new.decision
     where id = new.incident_id;

    if not found then
        raise exception 'Incident not found: %', new.incident_id;
    end if;

    if new.decision = 'confirmed' then
        insert into public.cases (incident_id)
        values (new.incident_id)
        on conflict (incident_id) do nothing
        returning id into opened_case_id;

        if opened_case_id is not null then
            insert into public.case_events (case_id, actor_id, event_type, to_status, details)
            values (
                opened_case_id,
                new.reviewer_id,
                'case_opened',
                'open',
                jsonb_build_object('review_id', new.id)
            );
            return new;
        end if;
    end if;

    select id into existing_case_id
      from public.cases
     where incident_id = new.incident_id;

    if existing_case_id is not null then
        insert into public.case_events (case_id, actor_id, event_type, details)
        values (
            existing_case_id,
            new.reviewer_id,
            'incident_review_changed',
            jsonb_build_object('review_id', new.id, 'decision', new.decision)
        );
    end if;

    return new;
end;
$$;

-- Cases for incidents that were confirmed before this migration.
with confirmed as (
    select incident.id as incident_id,
           coalesce(
               (select max(review.created_at)
                  from public.incident_reviews as review
                 where review.incident_id = incident.id
                   and review.decision = 'confirmed'),
               incident.updated_at
           ) as confirmed_at
      from public.incidents as incident
     where incident.review_status = 'confirmed'
), opened as (
    insert into public.cases (incident_id, opened_at)
    select incident_id, confirmed_at from confirmed
    on conflict (incident_id) do nothing
    returning id
)
insert into public.case_events (case_id, event_type, to_status, details)
select id, 'case_opened', 'open', jsonb_build_object('backfilled', true)
  from opened;

alter table public.cases enable row level security;
alter table public.case_events enable row level security;

revoke all on table public.cases, public.case_events from anon, authenticated;
grant select on table public.cases, public.case_events to authenticated;

create policy cases_operator_read
on public.cases
for select
to authenticated
using (public.is_trace_dump_operator());

create policy case_events_operator_read
on public.case_events
for select
to authenticated
using (public.is_trace_dump_operator());

-- Operators who can own a case.
create function public.list_case_assignees()
returns table (id uuid, email text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null
       or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required'
            using errcode = '42501';
    end if;

    return query
    select u.id,
           u.email::text,
           (u.raw_app_meta_data ->> 'trace_dump_role')::text
      from auth.users as u
     where coalesce(u.raw_app_meta_data ->> 'trace_dump_role', '')
           in ('operator', 'admin')
     order by u.email;
end;
$$;

revoke all on function public.list_case_assignees() from public, anon, authenticated;
grant execute on function public.list_case_assignees() to authenticated;

-- Assign an owner and choose the next action. Moves an open case to assigned.
create function public.assign_case(
    p_case_id uuid,
    p_owner_id uuid,
    p_next_action text,
    p_expected_status text
)
returns public.cases
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    current_case public.cases%rowtype;
    updated_case public.cases;
    new_status text;
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required'
            using errcode = '42501';
    end if;

    if p_owner_id is null
       or p_next_action is null
       or p_next_action not in ('cleanup', 'further_investigation', 'enforcement_referral') then
        raise exception 'An owner and a valid next action are required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
          from auth.users as u
         where u.id = p_owner_id
           and coalesce(u.raw_app_meta_data ->> 'trace_dump_role', '')
               in ('operator', 'admin')
    ) then
        raise exception 'The owner must be an operator'
            using errcode = '22023';
    end if;

    select * into current_case
      from public.cases
     where id = p_case_id
     for update;

    if not found then
        raise exception 'Case not found: %', p_case_id
            using errcode = 'P0002';
    end if;

    if current_case.status <> p_expected_status then
        raise exception 'Case status changed from % to %',
            p_expected_status, current_case.status
            using errcode = '40001';
    end if;

    if current_case.status = 'resolved' then
        raise exception 'A resolved case cannot be reassigned'
            using errcode = '22023';
    end if;

    if current_case.owner_id is not distinct from p_owner_id
       and current_case.next_action is not distinct from p_next_action then
        raise exception 'The owner and next action are unchanged'
            using errcode = '22023';
    end if;

    new_status := case current_case.status when 'open' then 'assigned' else current_case.status end;

    update public.cases
       set owner_id = p_owner_id,
           next_action = p_next_action,
           status = new_status,
           assigned_at = coalesce(assigned_at, now())
     where id = p_case_id
    returning * into updated_case;

    insert into public.case_events (case_id, actor_id, event_type, from_status, to_status, details)
    values (
        p_case_id,
        actor,
        'assignment_updated',
        current_case.status,
        new_status,
        jsonb_build_object(
            'owner_id', p_owner_id,
            'previous_owner_id', current_case.owner_id,
            'next_action', p_next_action,
            'previous_next_action', current_case.next_action
        )
    );

    return updated_case;
end;
$$;

revoke all on function public.assign_case(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.assign_case(uuid, uuid, text, text) to authenticated;

-- Move an assigned case forward: assigned -> in_progress -> resolved.
create function public.advance_case(
    p_case_id uuid,
    p_to_status text,
    p_notes text,
    p_expected_status text
)
returns public.cases
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    current_case public.cases%rowtype;
    updated_case public.cases;
    clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required'
            using errcode = '42501';
    end if;

    select * into current_case
      from public.cases
     where id = p_case_id
     for update;

    if not found then
        raise exception 'Case not found: %', p_case_id
            using errcode = 'P0002';
    end if;

    if current_case.status <> p_expected_status then
        raise exception 'Case status changed from % to %',
            p_expected_status, current_case.status
            using errcode = '40001';
    end if;

    if not (
        (current_case.status = 'assigned' and p_to_status = 'in_progress')
        or (current_case.status = 'in_progress' and p_to_status = 'resolved')
    ) then
        raise exception 'A % case cannot move to %', current_case.status, p_to_status
            using errcode = '22023';
    end if;

    if p_to_status = 'resolved' and clean_notes is null then
        raise exception 'Resolution notes are required'
            using errcode = '22023';
    end if;

    update public.cases
       set status = p_to_status,
           started_at = case when p_to_status = 'in_progress' then now() else started_at end,
           resolved_at = case when p_to_status = 'resolved' then now() else resolved_at end,
           resolution_notes = case when p_to_status = 'resolved' then clean_notes else resolution_notes end
     where id = p_case_id
    returning * into updated_case;

    insert into public.case_events (case_id, actor_id, event_type, from_status, to_status, details)
    values (
        p_case_id,
        actor,
        'status_changed',
        current_case.status,
        p_to_status,
        case when clean_notes is null then '{}'::jsonb else jsonb_build_object('notes', clean_notes) end
    );

    return updated_case;
end;
$$;

revoke all on function public.advance_case(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.advance_case(uuid, text, text, text) to authenticated;

-- Audit a case report download.
create function public.record_case_report(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required'
            using errcode = '42501';
    end if;

    if not exists (select 1 from public.cases where id = p_case_id) then
        raise exception 'Case not found: %', p_case_id
            using errcode = 'P0002';
    end if;

    insert into public.case_events (case_id, actor_id, event_type, details)
    values (p_case_id, actor, 'report_generated', jsonb_build_object('format', 'html'));
end;
$$;

revoke all on function public.record_case_report(uuid) from public, anon, authenticated;
grant execute on function public.record_case_report(uuid) to authenticated;
