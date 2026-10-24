-- Observable-risk rules are application-owned; reviewer adjustments are append-only.
create table public.incident_priority_adjustments (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null references public.incidents(id),
    reviewer_id uuid not null references auth.users(id),
    level text check (level in ('high', 'medium', 'low')),
    reason text not null check (length(btrim(reason)) between 1 and 1000),
    created_at timestamptz not null default clock_timestamp()
);
create index incident_priority_history on public.incident_priority_adjustments
    (incident_id, created_at desc, id desc);
alter table public.incident_priority_adjustments enable row level security;
revoke all on public.incident_priority_adjustments from anon, authenticated;
grant select on public.incident_priority_adjustments to authenticated;
create policy priority_operator_read on public.incident_priority_adjustments
    for select to authenticated using (public.is_trace_dump_operator());
create trigger priority_adjustments_append_only
before update or delete on public.incident_priority_adjustments
for each row execute function public.reject_incident_review_mutation();

create function public.set_incident_priority(
    p_incident_id uuid, p_level text, p_reason text, p_expected_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    current_id uuid;
    inserted_id uuid;
begin
    if auth.uid() is null or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required' using errcode = '42501';
    end if;
    if (p_level is not null and p_level not in ('high', 'medium', 'low'))
       or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
        raise exception 'Invalid priority or reason' using errcode = '22023';
    end if;
    perform 1 from public.incidents where id = p_incident_id for update;
    if not found then
        raise exception 'Incident not found' using errcode = 'P0002';
    end if;
    select id into current_id from public.incident_priority_adjustments
      where incident_id = p_incident_id order by created_at desc, id desc limit 1;
    if current_id is distinct from p_expected_id then
        raise exception 'Priority changed; refresh before adjusting' using errcode = '40001';
    end if;
    insert into public.incident_priority_adjustments (incident_id, reviewer_id, level, reason)
    values (p_incident_id, auth.uid(), p_level, btrim(p_reason)) returning id into inserted_id;
    return inserted_id;
end;
$$;
revoke all on function public.set_incident_priority(uuid, text, text, uuid)
    from public, anon, authenticated;
grant execute on function public.set_incident_priority(uuid, text, text, uuid) to authenticated;
