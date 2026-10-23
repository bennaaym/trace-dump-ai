-- Replace user assignments and manually edited deadlines with cleanup teams
-- and a server-calculated 24/48/72 hour SLA. Legacy assignment columns are
-- retained so already-deployed records and audit history remain intact.

create table public.cleanup_teams (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    constraint cleanup_teams_name_not_blank check (btrim(name) <> '')
);

alter table public.cleanup_cases
    add column assigned_team_id uuid,
    add column assigned_at timestamptz,
    add column sla_hours integer,
    add constraint cleanup_cases_assigned_team_fk
        foreign key (assigned_team_id) references public.cleanup_teams (id)
        on update restrict on delete restrict,
    add constraint cleanup_cases_sla_hours_valid
        check (sla_hours is null or sla_hours in (24, 48, 72)),
    add constraint cleanup_cases_team_assignment_complete
        check (
            (
                assigned_team_id is null
                and assigned_at is null
                and sla_hours is null
            )
            or (
                assigned_team_id is not null
                and assigned_at is not null
                and sla_hours is not null
                and due_at is not null
                and due_at = assigned_at + make_interval(hours => sla_hours)
            )
        ),
    add constraint cleanup_cases_assigned_at_ordered
        check (assigned_at is null or assigned_at >= created_at);

comment on table public.cleanup_teams is
    'Municipal cleanup teams selectable for cleanup work; teams do not authenticate.';
comment on column public.cleanup_cases.assigned_to is
    'Legacy authenticated-user assignment retained for audit compatibility. New assignments use assigned_team_id.';
comment on column public.cleanup_cases.assigned_at is
    'UTC timestamp of the original cleanup-team assignment; team edits do not reset it.';
comment on column public.cleanup_cases.sla_hours is
    'Resolution period selected at assignment. Only 24, 48, or 72 hours are valid.';

create index cleanup_cases_team_status_idx
    on public.cleanup_cases (assigned_team_id, status);

alter table public.cleanup_teams enable row level security;
revoke all on table public.cleanup_teams from anon, authenticated;
grant select on table public.cleanup_teams to authenticated;

create policy cleanup_teams_operator_read
on public.cleanup_teams for select to authenticated
using (public.is_trace_dump_operator());

alter table public.cleanup_case_history
    drop constraint cleanup_case_history_event_valid,
    add constraint cleanup_case_history_event_valid check (
        event_type in (
            'creation', 'assignment', 'priority_change', 'deadline_change',
            'instructions', 'status_transition', 'note', 'verification',
            'resolution', 'reconciliation_required', 'team_assignment',
            'sla_change', 'cleanup_marked_complete',
            'verification_completed', 'verification_rejected', 'reopened'
        )
    );

create or replace function public.mutate_cleanup_case(
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
    next_team_id uuid;
    next_team_name text;
    previous_team_name text;
    next_sla_hours integer;
    next_assigned_at timestamptz;
    next_due_at timestamptz;
    next_instructions text;
    action_notes text := nullif(btrim(coalesce(p_changes ->> 'notes', '')), '');
    outcome text := nullif(btrim(coalesce(p_changes ->> 'resolution_outcome', '')), '');
begin
    if actor is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    if p_action is null or p_action not in (
        'assign_cleanup', 'add_note', 'mark_cleaned', 'reopen', 'resolve'
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

    if p_action = 'assign_cleanup' then
        next_team_id := nullif(p_changes ->> 'team_id', '')::uuid;
        next_sla_hours := nullif(p_changes ->> 'sla_hours', '')::integer;
        next_instructions := nullif(btrim(coalesce(p_changes ->> 'instructions', '')), '');

        if next_team_id is null then
            raise exception 'A cleanup team is required' using errcode = '22023';
        end if;
        select team.name
          into next_team_name
          from public.cleanup_teams as team
         where team.id = next_team_id
           and (team.active or team.id = current_case.assigned_team_id);
        if not found then
            raise exception 'The selected cleanup team is not active' using errcode = '22023';
        end if;
        if next_sla_hours is null or next_sla_hours not in (24, 48, 72) then
            raise exception 'Resolution time must be 24, 48, or 72 hours' using errcode = '22023';
        end if;

        next_assigned_at := coalesce(current_case.assigned_at, now());
        next_due_at := case
            when current_case.assigned_team_id is null
              or next_sla_hours is distinct from current_case.sla_hours
                then next_assigned_at + make_interval(hours => next_sla_hours)
            else current_case.due_at
        end;

        if next_team_id is not distinct from current_case.assigned_team_id
           and next_sla_hours is not distinct from current_case.sla_hours
           and next_instructions is not distinct from current_case.instructions then
            raise exception 'No cleanup assignment changes were supplied' using errcode = '22023';
        end if;

        if current_case.assigned_team_id is not null then
            select team.name into previous_team_name
              from public.cleanup_teams as team
             where team.id = current_case.assigned_team_id;
        end if;

        update public.cleanup_cases set
            assigned_team_id = next_team_id,
            assigned_at = next_assigned_at,
            sla_hours = next_sla_hours,
            due_at = next_due_at,
            instructions = next_instructions,
            status = case
                when current_case.status = 'awaiting_cleanup' then 'in_progress'
                else current_case.status
            end,
            started_at = case
                when current_case.status = 'awaiting_cleanup' then now()
                else current_case.started_at
            end
        where id = current_case.id returning * into result_case;

        if next_team_id is distinct from current_case.assigned_team_id then
            insert into public.cleanup_case_history (
                cleanup_case_id, actor_id, event_type, notes
            ) values (
                current_case.id, actor, 'team_assignment',
                case when current_case.assigned_team_id is null
                    then 'Assigned to cleanup team ' || next_team_name || '.'
                    else 'Cleanup team changed from ' || coalesce(previous_team_name, 'unknown team') ||
                         ' to ' || next_team_name || '.'
                end
            );
        end if;
        if next_sla_hours is distinct from current_case.sla_hours then
            insert into public.cleanup_case_history (
                cleanup_case_id, actor_id, event_type, notes
            ) values (
                current_case.id, actor, 'sla_change',
                'Resolution time changed from ' || coalesce(current_case.sla_hours::text || 'h', 'not set') ||
                ' to ' || next_sla_hours::text || 'h. Due ' || next_due_at::text || '.'
            );
        end if;
        if next_instructions is distinct from current_case.instructions then
            insert into public.cleanup_case_history (
                cleanup_case_id, actor_id, event_type, notes
            ) values (
                current_case.id, actor, 'instructions',
                case when next_instructions is null
                    then 'Cleanup instructions cleared.'
                    else 'Cleanup instructions updated: ' || next_instructions
                end
            );
        end if;
        if current_case.status = 'awaiting_cleanup' then
            insert into public.cleanup_case_history (
                cleanup_case_id, actor_id, event_type,
                previous_status, new_status, notes
            ) values (
                current_case.id, actor, 'status_transition',
                'awaiting_cleanup', 'in_progress', 'Cleanup assignment accepted and work started.'
            );
        end if;

    elsif p_action = 'add_note' then
        if action_notes is null then
            raise exception 'A note is required' using errcode = '22023';
        end if;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type, notes
        ) values (current_case.id, actor, 'note', action_notes);
        update public.cleanup_cases set updated_at = now()
         where id = current_case.id returning * into result_case;

    elsif p_action = 'mark_cleaned' then
        if current_case.status <> 'in_progress' then
            raise exception 'Only in-progress cleanup can be marked cleaned' using errcode = '22023';
        end if;
        if current_case.assigned_team_id is null then
            raise exception 'Assign a cleanup team before marking the site cleaned' using errcode = '22023';
        end if;
        update public.cleanup_cases set status = 'verification'
         where id = current_case.id returning * into result_case;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type,
            previous_status, new_status, notes
        ) values (
            current_case.id, actor, 'cleanup_marked_complete',
            'in_progress', 'verification', 'The assigned team reported the site as cleaned.'
        );

    elsif p_action = 'reopen' then
        if current_case.status <> 'verification' then
            raise exception 'Only a case pending verification can be reopened' using errcode = '22023';
        end if;
        if action_notes is null then
            raise exception 'Explain why cleanup verification was rejected' using errcode = '22023';
        end if;
        update public.cleanup_cases set status = 'in_progress'
         where id = current_case.id returning * into result_case;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type, notes
        ) values (
            current_case.id, actor, 'verification_rejected',
            action_notes
        );
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type,
            previous_status, new_status, notes
        ) values (
            current_case.id, actor, 'reopened',
            'verification', 'in_progress', 'Case reopened because waste remains.'
        );

    elsif p_action = 'resolve' then
        if current_case.status <> 'verification' then
            raise exception 'Cleanup must be pending verification before resolution' using errcode = '22023';
        end if;
        if outcome is null
           or outcome not in ('cleanup_completed', 'site_already_cleared') then
            raise exception 'A valid resolution outcome is required' using errcode = '22023';
        end if;
        if action_notes is null then
            raise exception 'Verification notes are required' using errcode = '22023';
        end if;
        update public.cleanup_cases set
            status = 'resolved',
            resolution_outcome = outcome,
            resolution_notes = action_notes,
            resolved_at = now(),
            resolved_by = actor
        where id = current_case.id returning * into result_case;
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type, notes
        ) values (
            current_case.id, actor, 'verification_completed',
            'Verified as ' || outcome || '. ' || action_notes
        );
        insert into public.cleanup_case_history (
            cleanup_case_id, actor_id, event_type,
            previous_status, new_status, notes
        ) values (
            current_case.id, actor, 'resolution',
            'verification', 'resolved', 'Case resolved after human verification.'
        );
    end if;

    return result_case;
end;
$$;

revoke all on function public.mutate_cleanup_case(uuid, text, timestamptz, jsonb)
from public, anon, authenticated;
grant execute on function public.mutate_cleanup_case(uuid, text, timestamptz, jsonb)
to authenticated;
