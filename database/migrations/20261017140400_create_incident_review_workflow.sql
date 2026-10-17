-- Secure, append-only operator review workflow.

create function public.sync_incident_review_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.incidents
       set review_status = new.decision
     where id = new.incident_id;

    if not found then
        raise exception 'Incident not found: %', new.incident_id;
    end if;

    return new;
end;
$$;

create trigger incident_reviews_sync_status
after insert on public.incident_reviews
for each row execute function public.sync_incident_review_status();

create function public.reject_incident_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'Incident reviews are append-only';
end;
$$;

create trigger incident_reviews_append_only
before update or delete on public.incident_reviews
for each row execute function public.reject_incident_review_mutation();

create function public.review_incident(
    p_incident_id uuid,
    p_decision text,
    p_notes text default null
)
returns public.incident_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
    authenticated_reviewer uuid := auth.uid();
    inserted_review public.incident_reviews;
begin
    if authenticated_reviewer is null
       or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required'
            using errcode = '42501';
    end if;

    if p_decision is null
       or p_decision not in ('confirmed', 'dismissed', 'needs_investigation') then
        raise exception 'Invalid incident review decision'
            using errcode = '22023';
    end if;

    perform 1
      from public.incidents
     where id = p_incident_id
     for update;

    if not found then
        raise exception 'Incident not found: %', p_incident_id
            using errcode = 'P0002';
    end if;

    insert into public.incident_reviews (
        incident_id,
        reviewer_id,
        decision,
        notes
    )
    values (
        p_incident_id,
        authenticated_reviewer,
        p_decision,
        p_notes
    )
    returning * into inserted_review;

    return inserted_review;
end;
$$;

revoke all on function public.review_incident(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.review_incident(uuid, text, text)
to authenticated;
