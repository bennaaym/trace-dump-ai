-- Worker-reported, cumulative diagnostics for each camera in a simulation run.

alter table public.simulation_camera_monitors
    add column last_pipeline_stage text not null default 'task_pending',
    add column last_pipeline_stage_at timestamptz,
    add column last_segment_id text,
    add column last_detection_id uuid,
    add column last_analysis_id uuid,
    add column last_hafnia_summary_id uuid,
    add column last_classification text,
    add column diagnostics jsonb not null default '{}'::jsonb,
    add constraint simulation_camera_monitors_diagnostics_object
        check (jsonb_typeof(diagnostics) = 'object'),
    add constraint simulation_camera_monitors_classification_valid
        check (last_classification is null or last_classification in ('yes', 'no', 'uncertain'));

comment on column public.simulation_camera_monitors.last_pipeline_stage is
    'Last meaningful worker stage; task activity alone does not imply healthy video delivery.';
comment on column public.simulation_camera_monitors.diagnostics is
    'Cumulative worker counters for acquisition, detection, Hafnia, persistence, and deduplication.';
