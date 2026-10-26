-- A verified clean scene can close its cleanup case without waiting for a
-- human acknowledgement. The worker still requires Hafnia's explicit
-- clearance assessment, confidence, score, fresh frame, and observable area.
insert into public.cleanup_scene_check_policies (
    camera_id,
    automatic_resolution_enabled,
    confidence_policy_validated,
    minimum_confidence,
    looping_source
)
select camera.id, true, true, 0.9, camera.location_source = 'simulated'
  from public.cameras as camera
 where not camera.is_scene_check_fixture
on conflict (camera_id) do update set
    automatic_resolution_enabled = true,
    confidence_policy_validated = true,
    minimum_confidence = 0.9,
    updated_at = now();

-- Reconcile completed checks that already satisfy the same automatic-resolution
-- policy. This preserves the scene-check row and records the AI decision in
-- cleanup history rather than fabricating a human resolution.
with eligible as (
    select cleanup_case.id as cleanup_case_id,
           cleanup_case.status as previous_status,
           scene_check.id as scene_check_id,
           scene_check.cleanup_score,
           scene_check.confidence
      from public.cleanup_cases as cleanup_case
      join public.incidents as incident on incident.id = cleanup_case.incident_id
      join public.detections as detection on detection.id = incident.detection_id
      join public.cameras as camera on camera.id = detection.camera_id
      join public.cleanup_scene_check_policies as policy on policy.camera_id = camera.id
      join lateral (
          select check_row.*
            from public.cleanup_scene_checks as check_row
           where check_row.cleanup_case_id = cleanup_case.id
             and check_row.status = 'completed'
           order by check_row.analysis_completed_at desc nulls last,
                    check_row.created_at desc
           limit 1
      ) as scene_check on true
     where cleanup_case.status <> 'resolved'
       and scene_check.assessment = 'appears_cleared'
       and scene_check.current_waste_visible is false
       and scene_check.cleanup_score > 90
       and scene_check.confidence > policy.minimum_confidence
       and scene_check.fresh_frame
       and scene_check.camera_reference_matched
       and scene_check.object_region_observable
       and policy.automatic_resolution_enabled
       and policy.confidence_policy_validated
), resolved as (
    update public.cleanup_cases as cleanup_case
       set status = 'resolved',
           resolution_outcome = 'site_already_cleared',
           resolution_notes = 'Resolved by Hafnia AI Review.',
           resolution_source = 'ai',
           resolution_scene_check_id = eligible.scene_check_id,
           resolved_at = now(),
           resolved_by = null
      from eligible
     where cleanup_case.id = eligible.cleanup_case_id
       and cleanup_case.status <> 'resolved'
 returning cleanup_case.id, eligible.scene_check_id, eligible.previous_status
)
insert into public.cleanup_case_history (
    cleanup_case_id, event_type, previous_status, new_status, notes
)
select id,
       'resolution',
       previous_status,
       'resolved',
       'Resolved by Hafnia AI Review using scene check ' || scene_check_id::text || '.'
  from resolved;
