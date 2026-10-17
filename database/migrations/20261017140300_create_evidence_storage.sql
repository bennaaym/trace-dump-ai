-- Private Supabase Storage bucket for original incident evidence.

insert into storage.buckets (id, name, public)
values ('incident-evidence', 'incident-evidence', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

-- Operators may read only objects that have an evidence metadata record.
-- No authenticated INSERT, UPDATE, or DELETE policy is created: original
-- evidence uploads are restricted to the trusted service-role worker.
create policy incident_evidence_operator_read
on storage.objects
for select
to authenticated
using (
    bucket_id = 'incident-evidence'
    and public.is_trace_dump_operator()
    and exists (
        select 1
          from public.evidence
         where evidence.storage_path = storage.objects.name
    )
);
