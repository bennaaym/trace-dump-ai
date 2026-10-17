-- Core TraceDump AI application schema.

create table public.cameras (
    id uuid primary key,
    name text not null,
    latitude double precision,
    longitude double precision,
    location_source text not null,
    enabled boolean not null default false,
    status text not null default 'unknown',
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint cameras_name_not_blank check (btrim(name) <> ''),
    constraint cameras_location_source_valid
        check (location_source in ('real', 'simulated')),
    constraint cameras_status_valid
        check (status in ('online', 'offline', 'unknown')),
    constraint cameras_coordinates_paired
        check ((latitude is null) = (longitude is null)),
    constraint cameras_latitude_valid
        check (latitude is null or latitude between -90 and 90),
    constraint cameras_longitude_valid
        check (longitude is null or longitude between -180 and 180),
    constraint cameras_updated_after_created
        check (updated_at >= created_at)
);

comment on column public.cameras.id is
    'The existing XProtect camera GUID; no separate application camera ID is generated.';
comment on column public.cameras.status is
    'Observed camera connectivity, independent of recording availability or camera naming.';

create table public.detections (
    id uuid primary key default gen_random_uuid(),
    camera_id uuid not null,
    activity_start_at timestamptz not null,
    activity_end_at timestamptz not null,
    recording_start_at timestamptz not null,
    recording_end_at timestamptz not null,
    recording_uri text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint detections_camera_fk
        foreign key (camera_id) references public.cameras (id)
        on update restrict on delete restrict,
    constraint detections_activity_ordered
        check (activity_start_at <= activity_end_at),
    constraint detections_recording_ordered
        check (recording_start_at < recording_end_at),
    constraint detections_recording_contains_activity
        check (
            recording_start_at <= activity_start_at
            and activity_end_at <= recording_end_at
        ),
    constraint detections_recording_uri_not_blank
        check (btrim(recording_uri) <> ''),
    constraint detections_metadata_object
        check (jsonb_typeof(metadata) = 'object')
);

comment on table public.detections is
    'Candidate activity intervals selected by MOG2 and YOLO; these are not confirmed dumping incidents.';
comment on column public.detections.metadata is
    'Summary metadata only, such as detector version, actor classes, and activity-hit counts.';

create table public.analyses (
    id uuid primary key default gen_random_uuid(),
    detection_id uuid not null,
    hafnia_summary_id uuid,
    status text not null default 'pending',
    prompt_version text not null,
    model_id text,
    dumping_detected text,
    dumping_type text,
    event_offset_seconds double precision,
    description text,
    uncertainty text,
    raw_response jsonb,
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    constraint analyses_detection_fk
        foreign key (detection_id) references public.detections (id)
        on update restrict on delete restrict,
    constraint analyses_hafnia_summary_unique unique (hafnia_summary_id),
    constraint analyses_id_detection_unique unique (id, detection_id),
    constraint analyses_status_valid
        check (status in ('pending', 'processing', 'completed', 'failed')),
    constraint analyses_prompt_version_not_blank
        check (btrim(prompt_version) <> ''),
    constraint analyses_model_id_not_blank
        check (model_id is null or btrim(model_id) <> ''),
    constraint analyses_dumping_detected_valid
        check (dumping_detected is null or dumping_detected in ('yes', 'no', 'uncertain')),
    constraint analyses_dumping_type_valid
        check (dumping_type is null or dumping_type in ('static', 'dynamic', 'unknown')),
    constraint analyses_event_offset_nonnegative
        check (event_offset_seconds is null or event_offset_seconds >= 0),
    constraint analyses_completed_has_classification
        check (
            status <> 'completed'
            or (dumping_detected is not null and dumping_type is not null)
        ),
    constraint analyses_unfinished_has_no_classification
        check (
            status = 'completed'
            or (
                dumping_detected is null
                and dumping_type is null
                and event_offset_seconds is null
            )
        ),
    constraint analyses_completed_at_ordered
        check (
            completed_at is null
            or started_at is null
            or completed_at >= started_at
        )
);

comment on table public.analyses is
    'Immutable-in-history Hafnia attempts; retries create new rows rather than replacing earlier interpretations.';
comment on column public.analyses.raw_response is
    'Restricted server-side data; not granted to ordinary authenticated operator queries.';
comment on column public.analyses.error_message is
    'Restricted internal diagnostics; a failed request is not a negative classification.';

create table public.incidents (
    id uuid primary key default gen_random_uuid(),
    detection_id uuid not null,
    source_analysis_id uuid not null,
    classification text not null,
    review_status text not null default 'pending_review',
    description text not null,
    uncertainty text,
    occurred_at timestamptz,
    latitude double precision,
    longitude double precision,
    location_source text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint incidents_detection_unique unique (detection_id),
    constraint incidents_detection_fk
        foreign key (detection_id) references public.detections (id)
        on update restrict on delete restrict,
    constraint incidents_source_analysis_same_detection_fk
        foreign key (source_analysis_id, detection_id)
        references public.analyses (id, detection_id)
        on update restrict on delete restrict,
    constraint incidents_classification_valid
        check (classification in ('static_dumping', 'dynamic_dumping', 'unknown_dumping')),
    constraint incidents_review_status_valid
        check (review_status in ('pending_review', 'confirmed', 'dismissed', 'needs_investigation')),
    constraint incidents_description_not_blank
        check (btrim(description) <> ''),
    constraint incidents_location_source_valid
        check (location_source in ('real', 'simulated')),
    constraint incidents_coordinates_paired
        check ((latitude is null) = (longitude is null)),
    constraint incidents_latitude_valid
        check (latitude is null or latitude between -90 and 90),
    constraint incidents_longitude_valid
        check (longitude is null or longitude between -180 and 180),
    constraint incidents_updated_after_created
        check (updated_at >= created_at)
);

comment on table public.incidents is
    'Suspected dumping events created from a completed positive analysis and requiring human review.';
comment on column public.incidents.latitude is
    'Camera latitude snapshotted when the incident is created.';
comment on column public.incidents.longitude is
    'Camera longitude snapshotted when the incident is created.';

create table public.evidence (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null,
    role text not null,
    storage_path text not null,
    captured_at timestamptz,
    offset_seconds double precision,
    sha256 text,
    extraction_method text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint evidence_incident_fk
        foreign key (incident_id) references public.incidents (id)
        on update restrict on delete restrict,
    constraint evidence_storage_path_unique unique (storage_path),
    constraint evidence_role_valid
        check (role in ('before', 'event', 'after', 'representative')),
    constraint evidence_storage_path_valid
        check (
            storage_path like ('incidents/' || incident_id::text || '/%')
            and storage_path not like '%..%'
            and right(storage_path, 1) <> '/'
        ),
    constraint evidence_offset_nonnegative
        check (offset_seconds is null or offset_seconds >= 0),
    constraint evidence_sha256_valid
        check (sha256 is null or sha256 ~ '^[0-9A-Fa-f]{64}$'),
    constraint evidence_extraction_method_not_blank
        check (extraction_method is null or btrim(extraction_method) <> ''),
    constraint evidence_metadata_object
        check (jsonb_typeof(metadata) = 'object')
);

comment on table public.evidence is
    'Metadata and private Storage references only; image bytes are not stored in PostgreSQL.';

create table public.incident_reviews (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null,
    reviewer_id uuid not null,
    decision text not null,
    notes text,
    created_at timestamptz not null default now(),
    constraint incident_reviews_incident_fk
        foreign key (incident_id) references public.incidents (id)
        on update restrict on delete restrict,
    constraint incident_reviews_reviewer_fk
        foreign key (reviewer_id) references auth.users (id)
        on update restrict on delete restrict,
    constraint incident_reviews_decision_valid
        check (decision in ('confirmed', 'dismissed', 'needs_investigation'))
);

comment on table public.incident_reviews is
    'Append-only operator review audit records. Browser clients insert only through review_incident().';

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger cameras_set_updated_at
before update on public.cameras
for each row execute function public.set_updated_at();

create trigger incidents_set_updated_at
before update on public.incidents
for each row execute function public.set_updated_at();

create function public.protect_terminal_analysis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if old.status in ('completed', 'failed')
       and new is distinct from old then
        raise exception 'Completed and failed analyses are immutable; create a new attempt';
    end if;

    return new;
end;
$$;

create trigger analyses_protect_terminal
before update on public.analyses
for each row execute function public.protect_terminal_analysis();

create function public.prepare_incident_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    triggering_analysis public.analyses%rowtype;
    camera_snapshot public.cameras%rowtype;
    expected_classification text;
begin
    if new.review_status <> 'pending_review' then
        raise exception 'New incidents must start with pending_review';
    end if;

    select analysis.*
      into triggering_analysis
      from public.analyses as analysis
     where analysis.id = new.source_analysis_id
       and analysis.detection_id = new.detection_id;

    if not found then
        raise exception 'Source analysis does not belong to the incident detection';
    end if;

    if triggering_analysis.status <> 'completed'
       or triggering_analysis.dumping_detected <> 'yes' then
        raise exception 'Incidents require a completed positive analysis';
    end if;

    expected_classification := case triggering_analysis.dumping_type
        when 'static' then 'static_dumping'
        when 'dynamic' then 'dynamic_dumping'
        else 'unknown_dumping'
    end;

    if new.classification <> expected_classification then
        raise exception 'Incident classification must match the source analysis';
    end if;

    select camera.*
      into camera_snapshot
      from public.detections as detection
      join public.cameras as camera on camera.id = detection.camera_id
     where detection.id = new.detection_id;

    if not found then
        raise exception 'Incident detection or camera was not found';
    end if;

    new.latitude := camera_snapshot.latitude;
    new.longitude := camera_snapshot.longitude;
    new.location_source := camera_snapshot.location_source;
    return new;
end;
$$;

create trigger incidents_prepare_insert
before insert on public.incidents
for each row execute function public.prepare_incident_insert();

create function public.protect_incident_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if row(
        new.detection_id,
        new.source_analysis_id,
        new.classification,
        new.description,
        new.uncertainty,
        new.occurred_at,
        new.latitude,
        new.longitude,
        new.location_source,
        new.created_at
    ) is distinct from row(
        old.detection_id,
        old.source_analysis_id,
        old.classification,
        old.description,
        old.uncertainty,
        old.occurred_at,
        old.latitude,
        old.longitude,
        old.location_source,
        old.created_at
    ) then
        raise exception 'Incident source data and location snapshot are immutable';
    end if;

    if old.review_status <> 'pending_review'
       and new.review_status = 'pending_review' then
        raise exception 'A reviewed incident cannot be reset to pending_review';
    end if;

    return new;
end;
$$;

create trigger incidents_protect_history
before update on public.incidents
for each row execute function public.protect_incident_history();
