-- Hackathon demonstration cleanup teams. Stable IDs and name-based upserts
-- make this seed safe to apply repeatedly without creating duplicates.

insert into public.cleanup_teams (id, name, active)
values
    (
        'd3b8245a-55f1-4d87-8d19-1a66f11a0001'::uuid,
        'Cleanup Team A — Bordeaux North',
        true
    ),
    (
        'd3b8245a-55f1-4d87-8d19-1a66f11a0002'::uuid,
        'Cleanup Team B — Bordeaux South',
        true
    ),
    (
        'd3b8245a-55f1-4d87-8d19-1a66f11a0003'::uuid,
        'Cleanup Team C — Bordeaux East',
        true
    )
on conflict (name) do update
set active = excluded.active;

do $$
declare
    active_demo_team_count integer;
begin
    select count(*)
      into active_demo_team_count
      from public.cleanup_teams
     where active
       and name in (
           'Cleanup Team A — Bordeaux North',
           'Cleanup Team B — Bordeaux South',
           'Cleanup Team C — Bordeaux East'
       );

    if active_demo_team_count <> 3 then
        raise exception 'Expected all three hackathon cleanup teams to be active';
    end if;
end;
$$;
