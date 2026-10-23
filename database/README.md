# TraceDump AI database

This directory owns the Supabase PostgreSQL schema, Row Level Security policies, private evidence and recording buckets, and operator review workflow. The migrations do not contain seed incidents or production credentials.

## Entities and relationships

```text
cameras
  `-- detections
        |-- analyses (zero or many attempts)
        `-- incidents (zero or one)
              |-- evidence (zero or many assets)
              |-- incident_reviews (append-only history)
              |-- incident_recordings (zero or one on-demand derivative)
              `-- cleanup_cases
                    |-- cleanup_scene_checks (durable deadline/manual jobs)
                    `-- cleanup_notifications (deduplicated attention state)
```

- `cameras` uses the XProtect camera GUID as its primary key. Coordinates are paired and range-checked. `status` records observed connectivity only; no inference is made from demo camera names.
- `detections` stores selected activity and recording intervals plus compact detector metadata. Recording intervals must contain their activity intervals. Individual boxes, frames, and arrays do not belong in PostgreSQL.
- `analyses` preserves each Hafnia attempt. Completed attempts require a classification; pending, processing, and failed attempts cannot masquerade as negative classifications. Terminal attempts are immutable, and retries create new rows.
- `incidents` stores one suspected event per detection. An insert trigger requires a completed positive analysis for the same detection, verifies classification consistency, forces the initial `pending_review` state, and snapshots the camera coordinates.
- `evidence` stores metadata and a private Storage object path, never image bytes. Any number of roles may exist, and no three-image assumption is enforced.
- `incident_reviews` stores append-only operator actions. Updating or deleting a review raises an error.
- `incident_recordings` stores the preparation state and provenance of an operator-requested browser-compatible derivative. Its unique incident key, recording identity, and worker lease suppress duplicate exports.

Foreign keys use `RESTRICT`, so ordinary deletes cannot cascade through investigation history. IDs default to random UUIDs, but the future worker integration should reuse the worker's persisted activity-session UUID on retries or derive a stable UUID when replaying an artifact. The unique Hafnia summary ID, one-incident-per-detection constraint, and unique evidence object path provide additional idempotency boundaries.

## Worker field mapping

The migrated Python worker still writes local JSON. The next integration phase should perform database writes transactionally with the server-side Supabase service-role credential.

| Worker output | Database destination |
| --- | --- |
| XProtect `Camera.id`, name, enabled | `cameras` |
| `ActivitySession.id` | deterministic `detections.id` |
| `activity_start_utc`, `activity_end_utc` | `detections.activity_start_at`, `activity_end_at` |
| `recording_start_utc`, `recording_end_utc`, `xprotect_uri` | detection recording fields |
| `hit_count`, `actor_classes`, detector config/version | `detections.metadata` |
| Hafnia status, model, prompt version and parsed classification | `analyses` |
| Complete Hafnia response object | restricted `analyses.raw_response` |
| Positive parsed result | one `incidents` row, initially `pending_review` |
| Evidence role, timestamp, offset, SHA-256 and method | `evidence` |

The current worker treats Hafnia summary IDs as strings, while this schema follows the required UUID contract. Confirm the real gateway identifier format before persistence is implemented; do not coerce a non-UUID value silently.

## Security and RLS

RLS is enabled on all six tables. There are no anonymous policies and no authenticated write policies for machine-generated data.

An authenticated user is an operator only when the trusted JWT `app_metadata.trace_dump_role` claim is `operator` or `admin`. This claim must be assigned through an administrative server path; never derive authorization from user-editable metadata.

Operators can:

- read application records covered by the operator policies;
- read evidence objects that have a matching `evidence` row;
- call `review_incident(...)` to append a review and atomically update current incident status.

Operators cannot directly insert or update detections, analyses, incidents, evidence, or reviews. They also receive no column privilege for `analyses.raw_response` or `analyses.error_message`. Trusted server code may read those restricted fields with the service-role credential. Never expose that credential to the browser.

The current role model is deliberately coarse-grained. Per-camera, per-region, or multi-tenant authorization will require a separately designed membership model rather than permissive policies.

## Review workflow

Call the transactional RPC as an authenticated operator:

```sql
select public.review_incident(
    p_incident_id := '00000000-0000-0000-0000-000000000000'::uuid,
    p_decision := 'confirmed',
    p_notes := 'Visible object abandonment confirmed.',
    p_expected_status := 'pending_review'
);
```

The function derives `reviewer_id` from `auth.uid()`, locks the incident, inserts an append-only audit row, and updates `incidents.review_status` in the same transaction. A client-supplied reviewer ID is never accepted.
The expected status prevents a stale browser session from overwriting a newer
operator decision. Changes after the initial review require a non-empty reason.

## Evidence Storage

Migration `20261017140300_create_evidence_storage.sql` creates the private `incident-evidence` bucket. Original assets use unique paths such as:

```text
incidents/<incident-id>/<asset-id>-event.jpg
```

The database requires the path to remain under its incident prefix and globally unique. Only the trusted worker uploads originals, with Storage upsert disabled. Operators use authenticated downloads or short-lived signed URLs. No browser update/delete policy exists, so originals are immutable in normal operator workflows. Annotated derivatives must use separate objects and metadata rather than replacing originals.

## Incident recording playback

Migration `20261017141000_create_incident_recordings.sql` creates the private
`incident-recordings` bucket and an on-demand queue. Operators can request only
an existing incident and read only an unexpired object associated with an
available recording row. The browser never supplies a camera ID, time interval,
recording URI, or Storage path.

The service-role playback worker claims one row with `FOR UPDATE SKIP LOCKED`,
exports the exact detection interval, creates and validates an H.264 MP4,
uploads it privately, and records hashes and provenance. Cached objects and
incident-scoped local exports are removed after the configured retention
deadline. Repeated or concurrent requests reuse the same row and derivative.

## Next.js access

Server Components should query the operator-readable columns with the signed-in user's Supabase session so RLS is enforced. Review mutations should call `review_incident` through a validated, authenticated Server Action. Browser or general server code must not query restricted analysis fields with the service-role key; reserve those fields for narrow trusted-server diagnostics.

## Migrations

Canonical migrations live in `database/migrations/` and apply in timestamp order:

1. Tables, constraints, history guards, and coordinate snapshot logic.
2. Query indexes.
3. Grants and RLS.
4. Private Storage bucket and object-read policy.
5. Transactional incident review workflow.
6. A narrowly scoped bootstrap operator assignment for the initial investigator.
7. Safe investigation-response access and concurrency-aware review transitions.
8. On-demand private incident-recording queue, worker lease, and Storage policy.
9. Cleanup teams, deadline scheduling, leased scene checks, private follow-up
   snapshots, cancellation, AI-resolution safety gates, and notifications.

The Supabase CLI does **not** automatically discover this custom directory; it reads `supabase/migrations/`. For local validation, stage exact copies into a CLI project and treat this directory as canonical:

```powershell
supabase init
New-Item -ItemType Directory -Force supabase\migrations
Copy-Item database\migrations\*.sql supabase\migrations\
supabase start
supabase db reset
```

After testing, compare staged files with the canonical files and do not edit the staged copies. Before a later authorized deployment, link the intended non-production project, preview with `supabase db push --dry-run`, and only then run `supabase db push`. This task does not link or push to any remote project.

Prerequisites are the Supabase CLI and its local container runtime. A plain PostgreSQL instance is insufficient for the Storage and Auth migrations unless compatible `auth` and `storage` schemas already exist.

## Verification status

The migrations have been checked against the migrated worker's JSON shapes and statically parsed as PostgreSQL SQL. This environment does not have PostgreSQL, Docker, or the Supabase CLI, so the migrations have **not** been applied to a live or local Supabase database. Before worker integration, run a clean local `supabase db reset` and verify:

- interval and coordinate constraint failures;
- multiple analyses for one detection and terminal-analysis immutability;
- negative analyses producing no incident;
- positive completed analysis insertion and the one-incident constraint;
- evidence path and SHA-256 constraints;
- operator versus non-operator reads, restricted analysis columns, and absent browser writes;
- private bucket access and signed URL behavior;
- append-only review history and atomic incident status updates.
