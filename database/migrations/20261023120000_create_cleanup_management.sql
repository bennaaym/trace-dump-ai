-- Transactional cleanup-case lifecycle for confirmed dumping incidents.

create table public.cleanup_cases (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null unique,
    status text not null default 'awaiting_cleanup',
    priority text not null default 'normal',
    assigned_to uuid,
    due_at timestamptz,
    instructions text,
    completion_report text,
    resolution_outcome text,
    resolution_notes text,
    started_at timestamptz,
    resolved_at timestamptz,
    resolved_by uuid,
    created_by uuid,
    reconciliation_required boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint cleanup_cases_incident_fk foreign key (incident_id)
        references public.incidents (id) on update restrict on delete restrict,
    constraint cleanup_cases_assigned_to_fk foreign key (assigned_to)
        references auth.users (id) on update restrict on delete restrict,
    constraint cleanup_cases_resolved_by_fk foreign key (resolved_by)
        references auth.users (id) on update restrict on delete restrict,
    constraint cleanup_cases_created_by_fk foreign key (created_by)
        references auth.users (id) on update restrict on delete restrict,
    constraint cleanup_cases_status_valid check (
        status in ('awaiting_cleanup', 'in_progress', 'verification', 'resolved')
    ),
    constraint cleanup_cases_priority_valid check (
        priority in ('low', 'normal', 'high')
    ),
    constraint cleanup_cases_resolution_outcome_valid check (
        resolution_outcome is null
        or resolution_outcome in ('cleanup_completed', 'site_already_cleared')
    ),
    constraint cleanup_cases_instructions_not_blank check (
        instructions is null or btrim(instructions) <> ''
    ),
    constraint cleanup_cases_completion_report_not_blank check (
        completion_report is null or btrim(completion_report) <> ''
    ),
    constraint cleanup_cases_resolution_notes_not_blank check (
        resolution_notes is null or btrim(resolution_notes) <> ''
    ),
    constraint cleanup_cases_resolved_fields_consistent check (
        (status = 'resolved' and resolution_outcome is not null
            and resolution_notes is not null and resolved_at is not null
            and resolved_by is not null)
        or
        (status <> 'resolved' and resolution_outcome is null
            and resolution_notes is null and resolved_at is null
            and resolved_by is null)
    ),
    constraint cleanup_cases_started_state_consistent check (
        (status = 'awaiting_cleanup' and started_at is null)
        or (status <> 'awaiting_cleanup' and started_at is not null)
    ),
    constraint cleanup_cases_timestamps_ordered check (
        updated_at >= created_at
        and (started_at is null or started_at >= created_at)
        and (resolved_at is null or resolved_at >= coalesce(started_at, created_at))
    )
);

create table public.cleanup_case_history (
    id uuid primary key default gen_random_uuid(),
    cleanup_case_id uuid not null,
    actor_id uuid,
    event_type text not null,
    previous_status text,
    new_status text,
    notes text,
    created_at timestamptz not null default now(),
    constraint cleanup_case_history_case_fk foreign key (cleanup_case_id)
        references public.cleanup_cases (id) on update restrict on delete restrict,
    constraint cleanup_case_history_actor_fk foreign key (actor_id)
        references auth.users (id) on update restrict on delete restrict,
    constraint cleanup_case_history_event_valid check (
        event_type in (
            'creation', 'assignment', 'priority_change', 'deadline_change',
            'instructions', 'status_transition', 'note', 'verification',
            'resolution', 'reconciliation_required'
        )
    ),
    constraint cleanup_case_history_previous_status_valid check (
        previous_status is null or previous_status in (
            'awaiting_cleanup', 'in_progress', 'verification', 'resolved'
        )
    ),
    constraint cleanup_case_history_new_status_valid check (
        new_status is null or new_status in (
            'awaiting_cleanup', 'in_progress', 'verification', 'resolved'
        )
    ),
    constraint cleanup_case_history_notes_not_blank check (
        notes is null or btrim(notes) <> ''
    )
);

comment on table public.cleanup_cases is
    'One durable municipal cleanup workflow per confirmed incident.';
comment on column public.cleanup_cases.reconciliation_required is
    'Set when the linked incident is reclassified after confirmation; the case and audit trail are preserved.';
comment on table public.cleanup_case_history is
    'Append-only cleanup audit events. Browser clients write only through mutate_cleanup_case().';

create index cleanup_cases_status_due_idx
    on public.cleanup_cases (status, due_at nulls last, updated_at desc);
create index cleanup_cases_assigned_status_idx
    on public.cleanup_cases (assigned_to, status);
create index cleanup_case_history_case_created_idx
    on public.cleanup_case_history (cleanup_case_id, created_at, id);

create trigger cleanup_cases_set_updated_at
before update on public.cleanup_cases
for each row execute function public.set_updated_at();

create function public.reject_cleanup_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'Cleanup case history is append-only';
end;
$$;

create trigger cleanup_case_history_append_only
before update or delete on public.cleanup_case_history
for each row execute function public.reject_cleanup_history_mutation();

alter table public.cleanup_cases enable row level security;
alter table public.cleanup_case_history enable row level security;

revoke all on table public.cleanup_cases, public.cleanup_case_history
from anon, authenticated;
grant select on table public.cleanup_cases, public.cleanup_case_history
to authenticated;

create policy cleanup_cases_operator_read
on public.cleanup_cases for select to authenticated
using (public.is_trace_dump_operator());

create policy cleanup_case_history_operator_read
on public.cleanup_case_history for select to authenticated
using (public.is_trace_dump_operator());

create function public.sync_cleanup_case_from_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    inserted_case_id uuid;
    reconciled_case_id uuid;
begin
    if new.decision = 'confirmed' then
        insert into public.cleanup_cases (incident_id, created_by)
        values (new.incident_id, new.reviewer_id)
        on conflict (incident_id) do nothing
        returning id into inserted_case_id;

        if inserted_case_id is not null then
            insert into public.cleanup_case_history (
                cleanup_case_id, actor_id, event_type, new_status, notes
            ) values (
                inserted_case_id, new.reviewer_id, 'creation',
                'awaiting_cleanup', 'Created automatically when the incident was confirmed.'
            );
        else
            update public.cleanup_cases
               set reconciliation_required = false
             where incident_id = new.incident_id
               and reconciliation_required = true
            returning id into reconciled_case_id;

            if reconciled_case_id is not null then
                insert into public.cleanup_case_history (
                    cleanup_case_id, actor_id, event_type, notes
                ) values (
                    reconciled_case_id, new.reviewer_id, 'note',
                    'The linked incident was confirmed again; its reconciliation flag was cleared.'
                );
            end if;
        end if;
    else
        update public.cleanup_cases
           set reconciliation_required = true
         where incident_id = new.incident_id
           and reconciliation_required = false
        returning id into reconciled_case_id;

        if reconciled_case_id is not null then
            insert into public.cleanup_case_history (
                cleanup_case_id, actor_id, event_type, notes
            ) values (
                reconciled_case_id, new.reviewer_id, 'reconciliation_required',
                'The linked incident was reclassified as ' || new.decision ||
                '; an authorized operator must reconcile this cleanup case.'
            );
        end if;
    end if;
    return new;
end;
$$;

create trigger incident_reviews_sync_cleanup_case
after insert on public.incident_reviews
for each row execute function public.sync_cleanup_case_from_review();

-- Backfill is idempotent and uses the reviewer who first confirmed the incident.
with confirmed_incidents as (
    select
        incident.id as incident_id,
        confirmation.reviewer_id,
        coalesce(confirmation.created_at, incident.updated_at, incident.created_at)
            as confirmed_at
    from public.incidents as incident
    left join lateral (
        select review.reviewer_id, review.created_at
        from public.incident_reviews as review
        where review.incident_id = incident.id
          and review.decision = 'confirmed'
        order by review.created_at, review.id
        limit 1
    ) as confirmation on true
    where incident.review_status = 'confirmed'
), inserted_cases as (
    insert into public.cleanup_cases (incident_id, created_by, created_at, updated_at)
    select incident_id, reviewer_id, confirmed_at, confirmed_at
    from confirmed_incidents
    on conflict (incident_id) do nothing
    returning id, created_by, created_at
)
insert into public.cleanup_case_history (
    cleanup_case_id, actor_id, event_type, new_status, notes, created_at
)
select id, created_by, 'creation', 'awaiting_cleanup',
       'Backfilled automatically for an existing confirmed incident.', created_at
from inserted_cases;

create function public.list_cleanup_assignees()
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    return query
    select users.id, users.email::text
      from auth.users as users
     where coalesce(users.raw_app_meta_data ->> 'trace_dump_role', '')
           in ('operator', 'admin')
     order by lower(coalesce(users.email, users.id::text));
end;
$$;

revoke all on function public.list_cleanup_assignees()
from public, anon, authenticated;
grant execute on function public.list_cleanup_assignees() to authenticated;

create function public.mutate_cleanup_case(
    p_case_id uuid,
    p_action text,
    p_expected_updated_at timestamptz,
    p_changes jsonb default '{}'::jsonb
)
returns public.cleanup_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    current_case public.cleanup_cases%rowtype;
    result_case public.cleanup_cases%rowtype;
    next_assignee uuid;
    next_priority text;
    next_due_at timestamptz;
    next_instructions text;
    action_notes text := nullif(btrim(coalesce(p_changes ->> 'notes', '')), '');
    report text := nullif(btrim(coalesce(p_changes ->> 'completion_report', '')), '');
    outcome text := nullif(btrim(coalesce(p_changes ->> 'resolution_outcome', '')), '');
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    if p_action is null or p_action not in (
        'update_plan', 'add_note', 'start', 'submit_verification',
        'return_in_progress', 'resolve'
    ) then
        raise exception 'Invalid cleanup action' using errcode = '22023';
    end if;

    select * into current_case
      from public.cleanup_cases
     where id = p_case_id
     for update;
    if not found then
        raise exception 'Cleanup case not found' using errcode = 'P0002';
    end if;
    if p_expected_updated_at is null or current_case.updated_at <> p_expected_updated_at then
        raise exception 'Cleanup case changed since it was loaded' using errcode = '40001';
    end if;
    if current_case.status = 'resolved' then
        raise exception 'Resolved cleanup cases are read-only' using errcode = '22023';
    end if;

    if p_action = 'update_plan' then
        next_assignee := current_case.assigned_to;
        next_priority := current_case.priority;
        next_due_at := current_case.due_at;
        next_instructions := current_case.instructions;

        if p_changes ? 'assigned_to' then
            next_assignee := nullif(p_changes ->> 'assigned_to', '')::uuid;
            if next_assignee is not null and not exists (
                select 1 from auth.users as users
                 where users.id = next_assignee
                   and coalesce(users.raw_app_meta_data ->> 'trace_dump_role', '')
                       in ('operator', 'admin')
            ) then
                raise exception 'Assignee is not an authorized TraceDump user' using errcode = '22023';
            end if;
        end if;
        if p_changes ? 'priority' then
            next_priority := p_changes ->> 'priority';
            if next_priority not in ('low', 'normal', 'high') then
                raise exception 'Invalid cleanup priority' using errcode = '22023';
            end if;
        end if;
        if p_changes ? 'due_at' then
            next_due_at := nullif(p_changes ->> 'due_at', '')::timestamptz;
        end if;
        if p_changes ? 'instructions' then
            next_instructions := nullif(btrim(coalesce(p_changes ->> 'instructions', '')), '');
        end if;

        if next_assignee is not distinct from current_case.assigned_to
           and next_priority is not distinct from current_case.priority
           and next_due_at is not distinct from current_case.due_at
           and next_instructions is not distinct from current_case.instructions then
            raise exception 'No cleanup planning changes were supplied' using errcode = '22023';
        end if;

        update public.cleanup_cases set
            assigned_to = next_assignee,
            priority = next_priority,
            due_at = next_due_at,
            instructions = next_instructions
        where id = current_case.id returning * into result_case;

        if next_assignee is distinct from current_case.assigned_to then
            insert into public.cleanup_case_history (cleanup_case_id, actor_id, event_type, notes)
            values (
                current_case.id,
                actor,
                'assignment',
                'Assignment changed from ' || coalesce(current_case.assigned_to::text, 'unassigned') ||
                ' to ' || coalesce(next_assignee::text, 'unassigned') || '.'
            );
        end if;
        if next_priority is distinct from current_case.priority then
            insert into public.cleanup_case_history (cleanup_case_id, actor_id, event_type, notes)
            values (current_case.id, actor, 'priority_change', 'Priority changed from ' || current_case.priority || ' to ' || next_priority || '.');
        end if;
        if next_due_at is distinct from current_case.due_at then
            insert into public.cleanup_case_history (cleanup_case_id, actor_id, event_type, notes)
            values (
                current_case.id,
                actor,
                'deadline_change',
                'Deadline changed from ' || coalesce(current_case.due_at::text, 'not set') ||
                ' to ' || coalesce(next_due_at::text, 'not set') || '.'
            );
        end if;
        if next_instructions is distinct from current_case.instructions then
            insert into public.cleanup_case_history (cleanup_case_id, actor_id, event_type, notes)
            values (
                current_case.id,
                actor,
                'instructions',
                case when next_instructions is null
                    then 'Cleanup instructions cleared.'
                    else 'Cleanup instructions updated: ' || next_instructions
                end
            );
        end if;
    elsif p_action = 'add_note' then
        if action_notes is null then
            raise exception 'A progress note is required' using errcode = '22023';
        end if;
        insert into public.cleanup_case_history (cleanup_case_id, actor_id, event_type, notes)
        values (current_case.id, actor, 'note', action_notes);
        update public.cleanup_cases set updated_at = now()
        where id = current_case.id returning * into result_case;

    elsif p_action = 'start' then
        if current_case.status <> 'awaiting_cleanup' then
            raise exception 'Cleanup can only start from awaiting cleanup' using errcode = '22023';
        end if;
        if current_case.assigned_to is null then
            raise exception 'Assign an operator before starting cleanup' using errcode = '22023';
        end if;
        update public.cleanup_cases
           set status = 'in_progress', started_at = now()
         where id = current_case.id returning * into result_case;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type, previous_status, new_status, notes
        ) values (
            current_case.id, actor, 'status_transition', current_case.status,
            'in_progress', coalesce(action_notes, 'Cleanup started.')
        );

    elsif p_action = 'submit_verification' then
        if current_case.status <> 'in_progress' then
            raise exception 'Only in-progress cleanup can be submitted for verification' using errcode = '22023';
        end if;
        if report is null then
            raise exception 'A completion report or site-clear explanation is required' using errcode = '22023';
        end if;
        update public.cleanup_cases
           set status = 'verification', completion_report = report
         where id = current_case.id returning * into result_case;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type, previous_status, new_status, notes
        ) values (
            current_case.id, actor, 'verification', current_case.status,
            'verification', 'Completion report submitted: ' || report
        );

    elsif p_action = 'return_in_progress' then
        if current_case.status <> 'verification' then
            raise exception 'Only a case awaiting verification can return to in progress' using errcode = '22023';
        end if;
        if action_notes is null then
            raise exception 'Explain what remains incomplete' using errcode = '22023';
        end if;
        update public.cleanup_cases set status = 'in_progress'
         where id = current_case.id returning * into result_case;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type, previous_status, new_status, notes
        ) values (
            current_case.id, actor, 'status_transition', current_case.status,
            'in_progress', action_notes
        );

    elsif p_action = 'resolve' then
        if current_case.status <> 'verification' then
            raise exception 'Only a case awaiting verification can be resolved' using errcode = '22023';
        end if;
        if outcome is null
           or outcome not in ('cleanup_completed', 'site_already_cleared') then
            raise exception 'A valid resolution outcome is required' using errcode = '22023';
        end if;
        if action_notes is null then
            raise exception 'Resolution notes are required' using errcode = '22023';
        end if;
        update public.cleanup_cases set
            status = 'resolved', resolution_outcome = outcome,
            resolution_notes = action_notes, resolved_at = now(), resolved_by = actor
        where id = current_case.id returning * into result_case;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type, previous_status, new_status, notes
        ) values (
            current_case.id, actor, 'resolution', current_case.status,
            'resolved', 'Resolved as ' || outcome || '. ' || action_notes
        );
    end if;

    return result_case;
end;
$$;

revoke all on function public.mutate_cleanup_case(uuid, text, timestamptz, jsonb)
from public, anon, authenticated;
grant execute on function public.mutate_cleanup_case(uuid, text, timestamptz, jsonb)
to authenticated;
