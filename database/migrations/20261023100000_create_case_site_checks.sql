-- Automatic AI site checks for overdue cases.
-- A worker re-examines recent footage from the case camera and records whether the
-- reported waste still appears to be there. Results are leads: they never resolve a case.

create table public.case_site_checks (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null,
    status text not null default 'processing',
    result text,
    window_start_at timestamptz not null,
    window_end_at timestamptz not null,
    summary text,
    uncertainty text,
    hafnia_summary_id text,
    prompt_version text not null,
    model_id text,
    raw_response jsonb,
    error_code text,
    lease_owner text,
    lease_expires_at timestamptz,
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint case_site_checks_case_fk
        foreign key (case_id) references public.cases (id)
        on update restrict on delete restrict,
    constraint case_site_checks_status_valid
        check (status in ('processing', 'completed', 'failed')),
    constraint case_site_checks_result_valid
        check (result is null or result in ('still_present', 'cleared', 'uncertain')),
    constraint case_site_checks_window_ordered
        check (window_start_at < window_end_at),
    constraint case_site_checks_completed_has_result
        check (status <> 'completed' or (result is not null and completed_at is not null)),
    constraint case_site_checks_unfinished_has_no_result
        check (status = 'completed' or result is null),
    constraint case_site_checks_prompt_version_not_blank
        check (btrim(prompt_version) <> '')
);

comment on table public.case_site_checks is
    'AI re-examination of recent footage for an overdue case. A lead for human review, never a resolution.';
comment on column public.case_site_checks.result is
    'still_present: Hafnia saw the reported waste. cleared: Hafnia clearly saw the location without it. uncertain: anything else, including an obstructed or different view.';
comment on column public.case_site_checks.raw_response is
    'Restricted server-side data; not granted to ordinary authenticated operator queries.';

create index case_site_checks_case_idx on public.case_site_checks (case_id, created_at desc);
create index case_site_checks_created_idx on public.case_site_checks (created_at);

alter table public.case_site_checks enable row level security;
revoke all on table public.case_site_checks from anon, authenticated;

grant select (
    id,
    case_id,
    status,
    result,
    window_start_at,
    window_end_at,
    summary,
    uncertainty,
    prompt_version,
    model_id,
    created_at,
    completed_at
) on public.case_site_checks to authenticated;

create policy case_site_checks_operator_read
on public.case_site_checks
for select
to authenticated
using (public.is_trace_dump_operator());

-- Site checks appear in the case audit trail.
alter table public.case_events drop constraint case_events_type_valid;
alter table public.case_events add constraint case_events_type_valid
    check (event_type in (
        'case_opened',
        'assignment_updated',
        'status_changed',
        'incident_review_changed',
        'report_generated',
        'site_check_completed'
    ));

-- Claims the oldest overdue, unresolved case that has not been checked recently.
-- Service role only. Bounded by a minimum gap between checks per case and a daily
-- cap across all cases so the Hafnia allowance cannot be exhausted.
create function public.claim_case_site_check(
    p_worker_id text,
    p_prompt_version text,
    p_model_id text,
    p_lease_seconds integer default 900,
    p_min_interval_hours integer default 12,
    p_daily_limit integer default 20,
    p_window_seconds integer default 60
)
returns table (
    check_id uuid,
    case_id uuid,
    camera_id uuid,
    window_start_at timestamptz,
    window_end_at timestamptz,
    recorded_at timestamptz,
    classification text,
    incident_description text,
    analysis_response text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    chosen_case uuid;
    new_check public.case_site_checks;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'service role required' using errcode = '42501';
    end if;
    if btrim(coalesce(p_worker_id, '')) = ''
       or btrim(coalesce(p_prompt_version, '')) = ''
       or p_lease_seconds not between 60 and 3600
       or p_min_interval_hours < 1
       or p_daily_limit < 1
       or p_window_seconds not between 10 and 300 then
        raise exception 'invalid site check claim';
    end if;

    update public.case_site_checks as stale
       set status = 'failed',
           error_code = 'lease_expired',
           lease_owner = null,
           lease_expires_at = null
     where stale.status = 'processing'
       and stale.lease_expires_at < now();

    if (select count(*)
          from public.case_site_checks as recent
         where recent.created_at > now() - interval '24 hours') >= p_daily_limit then
        return;
    end if;

    select c.id
      into chosen_case
      from public.cases as c
      join public.incidents as i on i.id = c.incident_id
     where c.status <> 'resolved'
       and i.review_status = 'confirmed'
       and coalesce(i.occurred_at, i.created_at) < now() - interval '24 hours'
       and not exists (
           select 1
             from public.case_site_checks as s
            where s.case_id = c.id
              and (
                  s.status = 'processing'
                  or s.created_at > now() - make_interval(hours => p_min_interval_hours)
              )
       )
     order by coalesce(i.occurred_at, i.created_at)
     for update of c skip locked
     limit 1;

    if chosen_case is null then
        return;
    end if;

    insert into public.case_site_checks (
        case_id,
        window_start_at,
        window_end_at,
        prompt_version,
        model_id,
        lease_owner,
        lease_expires_at
    )
    values (
        chosen_case,
        now() - interval '10 seconds' - make_interval(secs => p_window_seconds),
        now() - interval '10 seconds',
        p_prompt_version,
        nullif(btrim(coalesce(p_model_id, '')), ''),
        p_worker_id,
        now() + make_interval(secs => p_lease_seconds)
    )
    returning * into new_check;

    return query
    select new_check.id,
           c.id,
           d.camera_id,
           new_check.window_start_at,
           new_check.window_end_at,
           coalesce(i.occurred_at, i.created_at),
           i.classification,
           i.description,
           a.raw_response ->> 'Response'
      from public.cases as c
      join public.incidents as i on i.id = c.incident_id
      join public.detections as d on d.id = i.detection_id
      join public.analyses as a on a.id = i.source_analysis_id
     where c.id = chosen_case;
end;
$$;

revoke all on function public.claim_case_site_check(text, text, text, integer, integer, integer, integer)
from public, anon, authenticated;
grant execute on function public.claim_case_site_check(text, text, text, integer, integer, integer, integer)
to service_role;
