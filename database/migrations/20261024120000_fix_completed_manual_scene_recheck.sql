-- Allow an unresolved cleanup case to be checked again after its prior check completed.
-- Existing scheduled checks are still consumed so their old deadline cannot fire later.

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

    select * into current_case
      from public.cleanup_cases
     where id = p_case_id
     for update;

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
        select 1
          from public.camera_scene_sources
         where camera_id = linked_camera_id and is_active
    ) and not exists (
        select 1
          from public.camera_scene_state state
          join public.camera_scene_sources source on source.id = state.scene_source_id
         where state.camera_id = linked_camera_id
           and state.status = 'ready'
           and state.verified_at > now() - interval '15 minutes'
           and source.camera_id = linked_camera_id
           and source.is_active
    ) then
        raise exception 'The controlled camera scene is not recently verified as ready'
            using errcode = '22023';
    end if;

    -- Repeated clicks while a check is running are idempotent.
    select * into result
      from public.cleanup_scene_checks
     where cleanup_case_id = current_case.id
       and status = 'running'
     order by created_at desc
     limit 1;

    if found then
        return result;
    end if;

    -- Consume an existing deadline/manual job instead of leaving it to run later.
    select * into result
      from public.cleanup_scene_checks
     where cleanup_case_id = current_case.id
       and status = 'scheduled'
     order by scheduled_for, created_at
     for update skip locked
     limit 1;

    if found then
        update public.cleanup_scene_checks
           set trigger_kind = 'manual',
               scheduled_for = now(),
               phase = 'queued',
               error_code = null,
               error_message = null
         where id = result.id
         returning * into result;
    else
        -- A completed/failed/cancelled history entry is immutable; create a new check.
        insert into public.cleanup_scene_checks (
            cleanup_case_id,
            trigger_kind,
            scheduled_for,
            phase
        ) values (
            current_case.id,
            'manual',
            now(),
            'queued'
        ) returning * into result;
    end if;

    insert into public.cleanup_case_history (
        cleanup_case_id,
        actor_id,
        event_type,
        notes
    ) values (
        current_case.id,
        actor,
        'verification',
        'Manual AI scene recheck requested.'
    );

    return result;
end;
$$;

