-- Keep clearance strength separate from model confidence. The score represents
-- how strongly the visible comparison supports cleanup; confidence represents
-- how reliable Hafnia considers that interpretation.

alter table public.cleanup_scene_checks
    add column cleanup_score double precision,
    add column comparison_reasoning jsonb not null default '[]'::jsonb,
    add constraint cleanup_scene_checks_cleanup_score_valid check (
        cleanup_score is null or cleanup_score between 0 and 100
    ),
    drop constraint cleanup_scene_checks_json_arrays,
    add constraint cleanup_scene_checks_json_arrays check (
        jsonb_typeof(grounded_observations) = 'array'
        and jsonb_typeof(limitations) = 'array'
        and jsonb_typeof(comparison_reasoning) = 'array'
    );

alter table public.cleanup_notifications
    drop constraint cleanup_notifications_kind_valid,
    add constraint cleanup_notifications_kind_valid check (
        kind in (
            'still_visible', 'uncertain', 'capture_failed', 'analysis_failed',
            'human_review_required'
        )
    );

create or replace function public.finish_cleanup_scene_check(
    p_check_id uuid,
    p_worker_id text,
    p_result jsonb
)
returns public.cleanup_scene_checks
language plpgsql
security definer
set search_path = ''
as $$
declare
    scene_check public.cleanup_scene_checks%rowtype;
    cleanup_case public.cleanup_cases%rowtype;
    requested_status text := coalesce(p_result ->> 'status', 'failed');
    result_status text := case
        when coalesce(p_result ->> 'status', 'failed') = 'retry' then 'scheduled'
        else coalesce(p_result ->> 'status', 'failed')
    end;
    result_assessment text := nullif(p_result ->> 'assessment', '');
    result_confidence double precision := nullif(p_result ->> 'confidence', '')::double precision;
    result_cleanup_score double precision := nullif(p_result ->> 'cleanup_score', '')::double precision;
    notification_kind text;
    notification_message text;
    policy_auto_resolution boolean := false;
    policy_confidence_validated boolean := false;
    policy_minimum_confidence double precision := 1.0;
begin
    if requested_status not in ('completed', 'failed', 'retry') then
        raise exception 'Invalid scene-check completion status' using errcode = '22023';
    end if;

    select * into scene_check
      from public.cleanup_scene_checks
     where id = p_check_id
     for update;
    if not found or scene_check.status <> 'running' or scene_check.lease_owner <> p_worker_id then
        raise exception 'Scene check lease is no longer owned by this worker' using errcode = '40001';
    end if;
    if requested_status = 'retry' and scene_check.attempt_count >= scene_check.max_attempts then
        result_status := 'failed';
    end if;

    select * into cleanup_case
      from public.cleanup_cases
     where id = scene_check.cleanup_case_id
     for update;

    select coalesce(policy.automatic_resolution_enabled, false),
           coalesce(policy.confidence_policy_validated, false),
           coalesce(policy.minimum_confidence, 1.0)
      into policy_auto_resolution, policy_confidence_validated,
           policy_minimum_confidence
      from public.incidents incident
      join public.detections detection on detection.id = incident.detection_id
      join public.cameras camera on camera.id = detection.camera_id
      left join public.cleanup_scene_check_policies policy on policy.camera_id = camera.id
     where incident.id = cleanup_case.incident_id;

    if cleanup_case.status = 'resolved' or scene_check.cancellation_requested then
        update public.cleanup_scene_checks set
            status = 'cancelled', cancellation_requested = true,
            lease_owner = null, lease_expires_at = null,
            error_code = 'case_resolved',
            error_message = 'Result ignored because the cleanup case was resolved.'
        where id = scene_check.id returning * into scene_check;
        return scene_check;
    end if;

    update public.cleanup_scene_checks set
        status = result_status,
        scheduled_for = case
            when requested_status = 'retry'
                then now() + make_interval(secs => least(900, 30 * power(2, attempt_count - 1))::integer)
            else scheduled_for
        end,
        reference_evidence_id = nullif(p_result ->> 'reference_evidence_id', '')::uuid,
        snapshot_storage_path = nullif(p_result ->> 'snapshot_storage_path', ''),
        captured_at = nullif(p_result ->> 'captured_at', '')::timestamptz,
        source_timestamp = nullif(p_result ->> 'source_timestamp', '')::timestamptz,
        source_age_ms = nullif(p_result ->> 'source_age_ms', '')::double precision,
        assessment = result_assessment,
        cleanup_score = result_cleanup_score,
        comparison_reasoning = coalesce(p_result -> 'comparison_reasoning', '[]'::jsonb),
        grounded_observations = coalesce(p_result -> 'grounded_observations', '[]'::jsonb),
        limitations = coalesce(p_result -> 'limitations', '[]'::jsonb),
        object_region_observable = (p_result ->> 'object_region_observable')::boolean,
        camera_reference_matched = (p_result ->> 'camera_reference_matched')::boolean,
        fresh_frame = (p_result ->> 'fresh_frame')::boolean,
        model_id = nullif(p_result ->> 'model_id', ''),
        model_version = nullif(p_result ->> 'model_version', ''),
        confidence = result_confidence,
        hafnia_summary_id = nullif(p_result ->> 'hafnia_summary_id', ''),
        analysis_completed_at = now(),
        error_code = nullif(p_result ->> 'error_code', ''),
        error_message = nullif(p_result ->> 'error_message', ''),
        lease_owner = null, lease_expires_at = null
    where id = scene_check.id returning * into scene_check;

    if result_status = 'completed'
       and result_assessment = 'appears_cleared'
       and policy_auto_resolution
       and policy_confidence_validated
       and result_cleanup_score > 90
       and result_confidence > policy_minimum_confidence
       and coalesce((p_result ->> 'fresh_frame')::boolean, false)
       and coalesce((p_result ->> 'camera_reference_matched')::boolean, false)
       and coalesce((p_result ->> 'object_region_observable')::boolean, false) then
        update public.cleanup_cases set
            status = 'resolved',
            resolution_outcome = 'site_already_cleared',
            resolution_notes = 'Resolved by Hafnia AI Review with cleanup score '
                || round(result_cleanup_score::numeric, 1)::text
                || '/100 at '
                || round((result_confidence * 100)::numeric, 1)::text
                || '% confidence.',
            resolution_source = 'ai',
            resolution_scene_check_id = scene_check.id,
            resolved_at = now(),
            resolved_by = null
        where id = cleanup_case.id and status <> 'resolved';
        if found then
            insert into public.cleanup_case_history (
                cleanup_case_id, event_type, previous_status, new_status, notes
            ) values (
                cleanup_case.id,
                'resolution',
                cleanup_case.status,
                'resolved',
                'Resolved by Hafnia AI Review using scene check '
                    || scene_check.id::text
                    || ', cleanup score '
                    || round(result_cleanup_score::numeric, 1)::text
                    || '/100, confidence '
                    || round((result_confidence * 100)::numeric, 1)::text
                    || '%.'
            );
        end if;
    elsif result_status = 'completed' then
        notification_kind := case
            when result_assessment = 'still_visible' then 'still_visible'
            else 'human_review_required'
        end;
        notification_message := 'Hafnia cleanup score '
            || coalesce(round(result_cleanup_score::numeric, 1)::text, 'not available')
            || '/100 with '
            || coalesce(round((result_confidence * 100)::numeric, 1)::text, 'unknown')
            || '% confidence. Human review is required.';
        insert into public.cleanup_notifications (
            cleanup_case_id, scene_check_id, kind, deduplication_key, title, message
        ) values (
            cleanup_case.id,
            scene_check.id,
            notification_kind,
            scene_check.id::text || ':' || notification_kind,
            'Human cleanup review required',
            notification_message
        ) on conflict (deduplication_key) do nothing;
    elsif now() >= cleanup_case.due_at then
        notification_kind := case
            when coalesce(p_result ->> 'error_code', '') like 'capture_%' then 'capture_failed'
            else 'analysis_failed'
        end;
        insert into public.cleanup_notifications (
            cleanup_case_id, scene_check_id, kind, deduplication_key, title, message
        ) values (
            cleanup_case.id,
            scene_check.id,
            notification_kind,
            scene_check.id::text || ':' || notification_kind,
            'Attention required for cleanup case',
            case notification_kind
                when 'capture_failed' then 'The follow-up camera frame could not be captured.'
                else 'The follow-up scene could not be analyzed.'
            end
        ) on conflict (deduplication_key) do nothing;
    end if;

    return scene_check;
end;
$$;

