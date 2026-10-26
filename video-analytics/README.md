# TraceDump video analytics

This package contains the migrated TraceDump worker for read-only XProtect acquisition, camera synchronization to Supabase, MOG2/YOLO activity detection, Hafnia analysis, and local incident evidence extraction. It never changes XProtect camera configuration.

## Package layout

- `xprotect/`: REST discovery/live JPEGs, MIP `JPEGLiveSource`, and MIP recording export.
- `detection/`: MOG2 motion analysis, YOLO actor detection, and activity sessions.
- `hafnia/`: gateway client and the versioned dumping prompt.
- `evidence/`: before/event/after keyframe extraction from exported recordings.
- `workers/`: quota-aware orchestration, deduplication state, and suspected-incident assembly.
- `db/`: server-side Supabase persistence, including idempotent camera synchronization and a durable pending-write outbox.

Python 3.11 is the migration baseline. The package declares support through Python 3.13 and is validated here on Python 3.13.

## Setup

Core commands and tests do not install Torch or Ultralytics automatically:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

Install the optional detection stack only on a machine prepared for it:

```powershell
python -m pip install -e ".[dev,detection]"
```

No YOLO weights are stored in this repository. Pass a local model path with `--yolo-model`; using an Ultralytics model name may cause Ultralytics to download weights.

Copy `.env.example` to `.env` and fill in local credentials. Process environment variables take precedence. XProtect, Supabase service-role, and Hafnia credentials remain server-side and are never passed as command-line arguments to the native helpers.

The MIP live/export bridges compile their small C# sources on demand using the Windows .NET Framework compiler and assemblies from `XPROTECT_MIPSDK_DIR`. Generated executables are ignored by Git. Recording validation also requires `ffprobe` on `PATH`.

## On-demand incident playback

Run `video-analytics playback-worker` as a separate low-priority process after
applying the incident-recordings migrations. The latest schema queues recordings
when incidents are created; an authorized operator can also request or retry playback. The worker claims
one incident at a time, exports its persisted XProtect interval, converts it to
H.264/yuv420p fast-start MP4 with a bounded ffmpeg thread count, validates the
duration, and uploads it to the private `incident-recordings` bucket.

Cached derivatives expire after `TRACEDUMP_PLAYBACK_RETENTION_HOURS` (24 by
default). Before claiming work, the worker removes expired private Storage
objects and their incident-scoped local export directory. Provenance hashes
and conversion metadata remain in PostgreSQL. Original MIP exports are never
served directly to browsers.

## Investigation features

The default versioned prompt is `dumping_v9.txt`, with structured observations, involved-vehicle plate attribution, and seven observable risk factors. Its requests include the actual clip duration. Timeline observations require distinct evidence-backed offsets so the worker can extract separate source frames. Plate processing scans the full bounded export but retains local OCR only when it matches the plate Hafnia attributed to the involved vehicle. An event offset requires a matching timed release observation; unsupported values remain unknown. Raw responses and existing analyses are preserved. These validation rules do not establish model accuracy.

Use `--recognize-plates` on an analysis-enabled `monitor` run for local CPU plate detection/OCR after a positive result. The simulation worker enables the same processing by default and validates both supported models under `models/plates` at startup; use `--plate-models-dir` for another local directory or `--no-recognize-plates` to opt out explicitly. Install the optional `.[plates]` extra and provide the supported local weights described in [PLATE_RECOGNITION.md](PLATE_RECOGNITION.md). No model is downloaded automatically. Existing alarm publication, simulation deduplication, scene checks, and recording queue behavior remain in place.

See [integration notes](../docs/FEATURES_1_TO_4_INTEGRATION.md) for verification and a manual video test.

## Commands

```powershell
video-analytics cameras
video-analytics cameras sync --dry-run
video-analytics cameras sync
video-analytics check
video-analytics analyze --camera CAMERA --start 2026-10-16T14:45:14Z --end 2026-10-16T14:45:28Z
video-analytics export --camera CAMERA --start 2026-10-16T14:45:14Z --end 2026-10-16T14:45:28Z
video-analytics monitor --camera CAMERA --dry-run --duration 60 --fps 5 --detect --yolo-model C:\models\yolo11n.pt
video-analytics scene-check-worker
video-analytics scene-check-worker --once
video-analytics simulation-worker
video-analytics simulation-worker --once
```

## Cleanup deadline scene checks

Apply `20261023150000_create_cleanup_scene_checks.sql`, then run
`video-analytics scene-check-worker` as a separate Windows process on the
XProtect/Hafnia machine. PostgreSQL durably schedules checks and claims them
with expiring leases, so worker restarts do not create duplicate jobs. A due
check captures two advancing `JPEGLiveSource` frames, stores the fresh snapshot
in the private `cleanup-scene-checks` bucket, and analyzes the corresponding
recent XProtect recording through the existing Hafnia model.

Apply `20261023160000_create_simulation_control_center.sql`,
`20261023170000_fix_cleanup_scene_check_claim.sql`, and
`20261023180000_add_simulation_pipeline_diagnostics.sql`, then run
`video-analytics simulation-worker` as another long-lived process. It
acknowledges durable Start, Stop, and scene-source commands from Supabase.
Set `SIMULATION_YOLO_MODEL` to an existing local model file (prefer an absolute
path when the worker runs as a service). The simulation worker refuses bare or
missing model names rather than allowing Ultralytics to download weights.
`SIMULATION_ACQUISITION_RETRIES` bounds live-source reconnects, and
`SIMULATION_RECORDING_SETTLE_SECONDS` delays Hafnia submission until XProtect
has had time to commit the selected recording interval.
Each Simulation Center run captures for a fixed 60-second window. Camera
capture then stops automatically; a Hafnia request already submitted during
the window is allowed to complete before the run is marked stopped.

The scene-source boundary is intentionally independent of XProtect. With
`SCENE_SOURCE_ADAPTER=http`, the worker calls a trusted private controller:

- `POST /v1/cameras/{camera-guid}/scene` with `source_type` and the opaque
  `source_reference` stored in `camera_scene_sources`.
- `GET /v1/cameras/{camera-guid}/scene`, returning `source_reference`, `ready`,
  and an optional `generation` string.

The worker reports Ready only after that controller confirms the exact source
and XProtect's `JPEGLiveSource` returns a changed, fresh frame. The default is
`unavailable`: the installed StableFPS driver does not expose a verified
runtime clip-switch API. A native StableFPS controller or an RTSP/MediaMTX
publisher can implement this contract without changing the page or schema.

For deterministic demos, `SCENE_SOURCE_ADAPTER=xprotect_camera` maps an
operational camera to a separate disabled XProtect camera whose
`is_scene_check_fixture` flag is true. The fixture remains absent from maps and
monitoring. Scene switching verifies its fresh live feed, and the subsequent
scene check records that fixture camera as the actual capture source.
Naming a synchronized camera `CAM-NN-CLEAN` automatically pairs it with
`CAM-NN` and creates exactly two active options: `Uncleaned scene` uses the
operational camera, while `Clean scene` uses the hidden fixture camera.

The installed Hafnia Gateway accepts exactly one XProtect clip and does not
support paired uploaded images. The worker therefore uses the original
post-dumping evidence metadata as grounded context and records this limitation.
Automatic case resolution is off by default and additionally requires a
validated camera policy; simulated/looping cameras are never eligible. Each
check that reaches Hafnia consumes one of the machine's daily requests.

`--camera` accepts a GUID, exact camera name, or the 1-based index from `cameras`. Monitoring requires `--dry-run` unless an explicit simulation run and positive Hafnia request cap are provided. AI-positive results are written as `pending_review`; they are not treated as confirmed incidents.

For an analysis-enabled monitoring run, the worker journals deterministic detection and analysis records under `runs/state/pending_supabase_sync.json` before sending them to Supabase. Temporary database or Storage failures leave operations in that file for the next run. Positive analyses create one incident per detection and upload only extracted JPEG keyframes to the private `incident-evidence` bucket; exported recordings remain local.

Camera synchronization reads GUID, display name, and `gisPoint` positioning metadata from XProtect. A dry run reads current Supabase rows so it can accurately show changes, but does not write. Initial monitoring defaults are applied only when a GUID is first inserted; later runs preserve the application-owned `enabled` and `status` fields. Cameras temporarily absent from discovery are left untouched.

## XProtect dumping alarms

Run `scripts/setup-xprotect-alarm.ps1` once on the XProtect machine to create the
`TraceDump AI Suspected Dumping` analytics event. Pass an XProtect basic-user
`PSCredential` and `-BasicUser`; the credential is used in memory and is not saved.

For each newly created positive incident, the worker first creates a native alarm
through the documented Alarms REST API. It then publishes the optional analytics
event when that event is configured; missing event configuration cannot suppress
the native alarm. The alarm contract
is centralized in `xprotect/alarms.py`: title `TraceDump AI — Suspected Dumping`,
description `AI-detected suspected dumping. Human review required.`, and fixed
priority `Medium`. The API event and alarm both use the original camera GUID and
UTC incident timestamp. The incident ID is carried as a tag and checked before
publishing to avoid intentional duplicates during reprocessing. Publication is
successful only when XProtect returns the created alarm ID. No XProtect Alarm
Definition or database migration is required because priority is supplied directly
to the native alarm API.

## Checks

```powershell
python -m pytest
python -m ruff check .
python -m ruff format --check .
```
