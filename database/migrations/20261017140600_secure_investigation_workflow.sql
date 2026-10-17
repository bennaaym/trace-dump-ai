-- Safe investigator access to the structured Hafnia response and
-- concurrency-aware, append-only review decisions.

create function public.get_analysis_investigation_response(
    p_analysis_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    response_text text;
begin
    if auth.uid() is null
       or not public.is_trace_dump_operator() then
        raise exception 'Operator authorization is required'
            using errcode = '42501';
    end if;

    select analysis.raw_response ->> 'Response'
      into response_text
      from public.analyses as analysis
     where analysis.id = p_analysis_id;

    return response_text;
end;
$$;

revoke all on function public.get_analysis_investigation_response(uuid)
from public, anon, authenticated;
grant execute on function public.get_analysis_investigation_response(uuid)
to authenticated;

drop function public.review_incident(uuid, text, text);

create function public.review_incident(
    p_incident_id uuid,
    p_decision text,
    p_notes text,
    p_expected_status text
)
returns public.incident_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
    authenticated_reviewer uuid := auth.uid();
    current_status text;
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

    if p_expected_status is null
       or p_expected_status not in (
           'pending_review',
           'confirmed',
           'dismissed',
           'needs_investigation'
       ) then
        raise exception 'Invalid expected incident review status'
            using errcode = '22023';
    end if;

    select incident.review_status
      into current_status
      from public.incidents as incident
     where incident.id = p_incident_id
     for update;

    if not found then
        raise exception 'Incident not found: %', p_incident_id
            using errcode = 'P0002';
    end if;

    if current_status <> p_expected_status then
        raise exception 'Incident review changed from % to %',
            p_expected_status,
            current_status
            using errcode = '40001';
    end if;

    if current_status = p_decision then
        raise exception 'Incident already has review status %', current_status
            using errcode = '22023';
    end if;

    if current_status <> 'pending_review'
       and nullif(btrim(coalesce(p_notes, '')), '') is null then
        raise exception 'A reason is required to change an existing decision'
            using errcode = '22023';
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
        nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning * into inserted_review;

    return inserted_review;
end;
$$;

revoke all on function public.review_incident(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.review_incident(uuid, text, text, text)
to authenticated;
