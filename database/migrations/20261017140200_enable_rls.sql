-- Least-privilege browser access. Trusted workers use the server-side
-- service-role credential, which bypasses RLS and must never reach a browser.

create function public.is_trace_dump_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select auth.uid() is not null
       and coalesce(auth.jwt() -> 'app_metadata' ->> 'trace_dump_role', '')
           in ('operator', 'admin');
$$;

revoke all on function public.is_trace_dump_operator() from public;
grant execute on function public.is_trace_dump_operator() to authenticated;
grant usage on schema public to authenticated;

alter table public.cameras enable row level security;
alter table public.detections enable row level security;
alter table public.analyses enable row level security;
alter table public.incidents enable row level security;
alter table public.evidence enable row level security;
alter table public.incident_reviews enable row level security;

revoke all on table
    public.cameras,
    public.detections,
    public.analyses,
    public.incidents,
    public.evidence,
    public.incident_reviews
from anon, authenticated;

grant select on table
    public.cameras,
    public.detections,
    public.incidents,
    public.evidence,
    public.incident_reviews
to authenticated;

-- Raw model responses and internal errors stay behind a trusted server-side
-- boundary. Ordinary operator queries receive only reviewed application fields.
grant select (
    id,
    detection_id,
    hafnia_summary_id,
    status,
    prompt_version,
    model_id,
    dumping_detected,
    dumping_type,
    event_offset_seconds,
    description,
    uncertainty,
    started_at,
    completed_at,
    created_at
) on public.analyses to authenticated;

create policy cameras_operator_read
on public.cameras
for select
to authenticated
using (public.is_trace_dump_operator());

create policy detections_operator_read
on public.detections
for select
to authenticated
using (public.is_trace_dump_operator());

create policy analyses_operator_read
on public.analyses
for select
to authenticated
using (public.is_trace_dump_operator());

create policy incidents_operator_read
on public.incidents
for select
to authenticated
using (public.is_trace_dump_operator());

create policy evidence_operator_read
on public.evidence
for select
to authenticated
using (public.is_trace_dump_operator());

create policy incident_reviews_operator_read
on public.incident_reviews
for select
to authenticated
using (public.is_trace_dump_operator());
