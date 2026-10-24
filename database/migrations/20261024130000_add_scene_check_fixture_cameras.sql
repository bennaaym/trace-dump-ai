-- A fixture camera is a real XProtect camera used only as a deterministic
-- follow-up source for simulated cleanup scene checks.

alter table public.cameras
    add column is_scene_check_fixture boolean not null default false,
    add constraint cameras_fixture_not_monitored check (
        not is_scene_check_fixture or not enabled
    );

alter table public.camera_scene_sources
    add column target_camera_id uuid references public.cameras (id)
        on update restrict on delete restrict,
    add constraint camera_scene_sources_mapped_camera_valid check (
        source_type <> 'xprotect_camera'
        or (
            target_camera_id is not null
            and target_camera_id <> camera_id
            and source_reference = target_camera_id::text
        )
    );

alter table public.camera_scene_state
    add column capture_camera_id uuid references public.cameras (id)
        on update restrict on delete restrict;

alter table public.cleanup_scene_checks
    add column capture_camera_id uuid references public.cameras (id)
        on update restrict on delete restrict;

comment on column public.cameras.is_scene_check_fixture is
    'Hidden, disabled XProtect camera used only for deterministic simulated scene checks.';
comment on column public.camera_scene_sources.target_camera_id is
    'Optional XProtect fixture camera selected by an xprotect_camera scene source.';
comment on column public.cleanup_scene_checks.capture_camera_id is
    'Actual XProtect camera used to capture the follow-up, retained for auditability.';

