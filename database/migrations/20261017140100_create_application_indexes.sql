-- Query-path indexes for worker idempotency and investigator workflows.

create index detections_camera_activity_idx
    on public.detections (camera_id, activity_start_at desc);

create index detections_camera_join_idx
    on public.detections (camera_id, id);

create index analyses_detection_status_created_idx
    on public.analyses (detection_id, status, created_at desc);

create index analyses_status_created_idx
    on public.analyses (status, created_at desc);

create index incidents_review_status_occurred_idx
    on public.incidents (review_status, occurred_at desc nulls last);

-- incidents.detection_id is already indexed by its unique constraint. Together
-- with detections_camera_join_idx it supports incident queries by camera.

create index evidence_incident_created_idx
    on public.evidence (incident_id, created_at);

create index incident_reviews_incident_created_idx
    on public.incident_reviews (incident_id, created_at);
