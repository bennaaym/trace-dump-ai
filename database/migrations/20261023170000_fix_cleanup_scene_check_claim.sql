-- Qualify columns that also exist as RETURNS TABLE output variables. Without
-- aliases PostgreSQL raises an ambiguous-column error when the RPC executes.

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

    update public.cleanup_scene_checks as expired_check
       set status = case
               when expired_check.attempt_count < expired_check.max_attempts
                   then 'scheduled'
               else 'failed'
           end,
           scheduled_for = case
               when expired_check.attempt_count < expired_check.max_attempts
                   then now()
               else expired_check.scheduled_for
           end,
           trigger_kind = case
               when expired_check.attempt_count < expired_check.max_attempts
                   then 'retry'
               else expired_check.trigger_kind
           end,
           lease_owner = null,
           lease_expires_at = null,
           error_code = 'lease_expired',
           error_message = 'The previous worker lease expired.'
     where expired_check.status = 'running'
       and expired_check.lease_expires_at < now();

    select scene_check.id into claimed_id
      from public.cleanup_scene_checks as scene_check
      join public.cleanup_cases as cleanup_case on cleanup_case.id = scene_check.cleanup_case_id
     where scene_check.status = 'scheduled'
       and scene_check.scheduled_for <= now()
       and cleanup_case.status <> 'resolved'
       and not exists (
           select 1 from public.cleanup_scene_checks as running_check
            where running_check.cleanup_case_id = scene_check.cleanup_case_id
              and running_check.status = 'running'
       )
     order by scene_check.scheduled_for, scene_check.created_at
     for update of scene_check skip locked
     limit 1;
    if claimed_id is null then return; end if;

    update public.cleanup_scene_checks as claimed_check
       set status = 'running',
           attempt_count = claimed_check.attempt_count + 1,
           lease_owner = p_worker_id,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           analysis_started_at = now(),
           cancellation_requested = false,
           error_code = null,
           error_message = null
     where claimed_check.id = claimed_id;

    return query
    select scene_check.id, cleanup_case.id, cleanup_case.incident_id, camera.id, camera.name,
           camera.location_source, cleanup_case.due_at,
           scene_check.attempt_count, scene_check.max_attempts,
           scene_check.cancellation_requested, incident.description,
           reference.id, reference.storage_path, reference.role, reference.metadata,
           coalesce(policy.automatic_resolution_enabled, false),
           coalesce(policy.confidence_policy_validated, false),
           coalesce(policy.minimum_confidence, 0.9),
           (coalesce(policy.looping_source, false) or camera.location_source = 'simulated')
      from public.cleanup_scene_checks as scene_check
      join public.cleanup_cases as cleanup_case on cleanup_case.id = scene_check.cleanup_case_id
      join public.incidents as incident on incident.id = cleanup_case.incident_id
      join public.detections as detection on detection.id = incident.detection_id
      join public.cameras as camera on camera.id = detection.camera_id
      left join public.cleanup_scene_check_policies as policy on policy.camera_id = camera.id
      left join lateral (
          select evidence.id, evidence.storage_path, evidence.role, evidence.metadata
            from public.evidence as evidence
           where evidence.incident_id = incident.id
             and evidence.role in ('after', 'event', 'representative')
           order by case evidence.role when 'after' then 0 when 'event' then 1 else 2 end,
                    evidence.created_at desc
           limit 1
      ) as reference on true
     where scene_check.id = claimed_id;
end;
$$;

revoke all on function public.claim_cleanup_scene_check(text, integer)
from public, anon, authenticated;
grant execute on function public.claim_cleanup_scene_check(text, integer)
to service_role;
