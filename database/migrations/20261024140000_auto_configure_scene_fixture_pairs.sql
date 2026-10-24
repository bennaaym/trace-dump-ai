-- Demo convention: CAM-NN-CLEAN is a hidden fixture paired with CAM-NN.
-- The pair exposes exactly two scene choices without changing either stream.

alter table public.camera_scene_sources
    drop constraint camera_scene_sources_mapped_camera_valid,
    add constraint camera_scene_sources_mapped_camera_valid check (
        source_type <> 'xprotect_camera'
        or (
            target_camera_id is not null
            and source_reference = target_camera_id::text
        )
    );

create function public.classify_scene_check_fixture_camera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.name ~* '-CLEAN$' then
        new.is_scene_check_fixture := true;
        new.enabled := false;
    end if;
    return new;
end;
$$;

create trigger cameras_classify_scene_check_fixture
before insert or update of name, enabled on public.cameras
for each row execute function public.classify_scene_check_fixture_camera();

create function public.configure_scene_check_fixture_pair(p_fixture_camera_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    fixture public.cameras%rowtype;
    operational public.cameras%rowtype;
    operational_name text;
begin
    select * into fixture
      from public.cameras
     where id = p_fixture_camera_id
       and is_scene_check_fixture;
    if not found then return; end if;

    operational_name := regexp_replace(fixture.name, '-CLEAN$', '', 'i');
    select * into operational
      from public.cameras
     where lower(name) = lower(operational_name)
       and not is_scene_check_fixture
     order by created_at
     limit 1;
    if not found then return; end if;

    update public.camera_scene_sources
       set is_active = false,
           updated_at = now()
     where camera_id = operational.id
       and name not in ('Clean scene', 'Uncleaned scene');

    insert into public.camera_scene_sources (
        camera_id, name, description, source_type, source_reference,
        target_camera_id, is_active
    ) values
        (
            operational.id,
            'Uncleaned scene',
            'Use the operational camera stream containing the dumping scene.',
            'xprotect_camera',
            operational.id::text,
            operational.id,
            true
        ),
        (
            operational.id,
            'Clean scene',
            'Use the paired hidden camera stream containing the cleaned scene.',
            'xprotect_camera',
            fixture.id::text,
            fixture.id,
            true
        )
    on conflict (camera_id, name) do update set
        description = excluded.description,
        source_type = excluded.source_type,
        source_reference = excluded.source_reference,
        target_camera_id = excluded.target_camera_id,
        is_active = true,
        updated_at = now();
end;
$$;

create function public.sync_scene_check_fixture_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.configure_scene_check_fixture_pair(new.id);
    return new;
end;
$$;

create trigger cameras_sync_scene_check_fixture_pair
after insert or update of name, is_scene_check_fixture on public.cameras
for each row execute function public.sync_scene_check_fixture_pair();

-- Backfill cameras synchronized before this migration was applied.
update public.cameras
   set is_scene_check_fixture = true,
       enabled = false,
       updated_at = now()
 where name ~* '-CLEAN$';

select public.configure_scene_check_fixture_pair(id)
  from public.cameras
 where is_scene_check_fixture;

revoke all on function public.configure_scene_check_fixture_pair(uuid)
from public, anon, authenticated;
grant execute on function public.configure_scene_check_fixture_pair(uuid)
to service_role;

