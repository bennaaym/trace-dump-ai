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
applying the incident-recordings migration. The web application queues only
recordings explicitly requested by an authorized operator. The worker claims
one incident at a time, exports its persisted XProtect interval, converts it to
H.264/yuv420p fast-start MP4 with a bounded ffmpeg thread count, validates the
duration, and uploads it to the private `incident-recordings` bucket.

Cached derivatives expire after `TRACEDUMP_PLAYBACK_RETENTION_HOURS` (24 by
default). Before claiming work, the worker removes expired private Storage
objects and their incident-scoped local export directory. Provenance hashes
and conversion metadata remain in PostgreSQL. Original MIP exports are never
served directly to browsers.

## Commands

```powershell
video-analytics cameras
video-analytics cameras sync --dry-run
video-analytics cameras sync
video-analytics check
video-analytics analyze --camera CAMERA --start 2026-10-16T14:45:14Z --end 2026-10-16T14:45:28Z
video-analytics export --camera CAMERA --start 2026-10-16T14:45:14Z --end 2026-10-16T14:45:28Z
video-analytics monitor --camera CAMERA --dry-run --duration 60 --fps 5 --detect --yolo-model C:\models\yolo11n.pt
```

`--camera` accepts a GUID, exact camera name, or the 1-based index from `cameras`. Monitoring requires `--dry-run` unless an explicit simulation run and positive Hafnia request cap are provided. AI-positive results are written as `pending_review`; they are not treated as confirmed incidents.

For an analysis-enabled monitoring run, the worker journals deterministic detection and analysis records under `runs/state/pending_supabase_sync.json` before sending them to Supabase. Temporary database or Storage failures leave operations in that file for the next run. Positive analyses create one incident per detection and upload only extracted JPEG keyframes to the private `incident-evidence` bucket; exported recordings remain local.

Camera synchronization reads GUID, display name, and `gisPoint` positioning metadata from XProtect. A dry run reads current Supabase rows so it can accurately show changes, but does not write. Initial monitoring defaults are applied only when a GUID is first inserted; later runs preserve the application-owned `enabled` and `status` fields. Cameras temporarily absent from discovery are left untouched.

## Checks

```powershell
python -m pytest
python -m ruff check .
python -m ruff format --check .
```

## Event timing

New analyses default to the versioned `dumping_v7.txt` prompt, which returns the `investigation_v1` JSON contract. It requests one approximate clip-relative deposit/release time, or Unknown when the action cannot be timed. A locally configured `DUMPING_PROMPT_PATH` still overrides this default.

The worker rejects ambiguous ranges, negative offsets, wall-clock timestamps, and times outside the selected recording interval. Zero seconds is a valid event time. Unknown/invalid times produce a midpoint frame labeled `representative`, never `event`. Context frames sharing an event frame are omitted without removing the event frame. Existing analyses and evidence are not rewritten automatically.


## Evidence-linked investigation timeline

The default prompt requests up to twelve timestamped observations, explicit uncertainty, contradictions, and alternative hypotheses. The worker validates observation identifiers and clip-relative offsets and extracts original source frames for valid times. Invalid or unknown times remain unknown and do not receive invented frame links.

Structured observations remain in the immutable original analysis response (`analyses.raw_response.Response`). Evidence metadata records the worker-owned `observation_id`, while existing evidence rows retain Storage paths, actual frame offsets, and hashes. No new database columns or migration are required for this timeline. Missing or failed frame extraction remains visible as unavailable in the UI. Existing labeled-text responses remain supported and are not retroactively converted into observations.

The AI Analysis tab shows the timeline, actual source-frame links, and links to seek the recording. Model-supplied contradictions and a limited text check for a positive assessment describing no visible deposit are review flags, not new classifications or proof. A source frame enables inspection; it does not verify an AI claim. Explicit `DUMPING_PROMPT_PATH` overrides continue to take precedence.


The historical v5 prompt preserved the detection-instruction paragraphs from v2. The current v7 prompt strengthens the visible-evidence and consistency requirements at the user's request. The v3 prompt is retained for provenance, not used by default. A prompt-prefix regression test protects this boundary. Identical detection instructions do not guarantee identical VLM output, correct timing, or consistency between classification and narrative.

## Optional plate recognition

Pass `--recognize-plates` to an analysis-enabled monitor run to scan positive incidents with the supported local CPU ONNX detector and OCR. See [PLATE_RECOGNITION.md](PLATE_RECOGNITION.md) for model requirements, evidence provenance, limitations, and the manual test command. This option does not alter the detection prompt. It does not download models and does not reprocess existing incidents.


## Observable risk and incident priority

The current `dumping_v7` prompt includes an independent `risk_factors` output object with all seven named keys. Historical v5 preserved v4 and introduced this contract. Existing `DUMPING_PROMPT_PATH` overrides still apply. Risk fields are retained in the immutable original analysis response; they never change the parsed dumping classification or confirm an incident. No new runtime variables or models are needed.

The incident UI applies versioned deterministic rules (`observable-risk-v1`): roadway/path obstruction or visible smoke/leakage is High; large/scattered discarded material or proximity to an entrance/crossing is Medium; Low requires all seven factors explicitly absent. Otherwise the assessment is Unknown. Each yes/no requires a nonempty visible-evidence explanation, and valid clip-relative timestamps link to playback. These are AI-reported observations for human review, not verified hazard measurements. Legacy responses remain Unknown; they are not backfilled from narrative keywords.

Apply `database/migrations/20261024000000_incident_priority_adjustments.sql` to enable reviewer priority adjustments. Operators can set High/Medium/Low or return to automatic, always with a reason. The database records append-only history, validates operator authorization and rejects stale edits. This does not alter incident review status. The UI remains readable before this migration and explicitly disables adjustments.

For a fresh manual test, run the Ipoh analysis with a new simulation ID (for example `--simulation-run ipoh-risk-manual-001`) and the default prompt. Inspect the new incident's Number plate evidence and Incident priority cards. Expand Observable risk factors to inspect claims and supporting moments; check any reviewer adjustment survives refresh. Existing incidents do not acquire new risk findings automatically.


## Evidence-grounded prompt and timing validation (v7)

The user-authorized v7 prompt distinguishes visible deposit/release from an existing pile, loading/collection, and ambiguous movement. Requests include the actual selected recording duration. The model must link the main event marker to a timed release observation using `event_observation_id`; absent, invalid or inconsistent references produce an unknown event time and an explicit explanation. The original raw answer and classification remain preserved. Explicitly unknown observation times stay untimed. Both Python and UI now preserve narrative/uncertainty arrays if a response deviates from the requested string fields.

This improves validation, not the truth of model observations. Controlled same-recording comparisons still returned unsupported 0.3-second release claims and omitted event references. v7 produced named risk fields, but repeated risk assessments differed. Do not treat stronger wording, consistent positive labels, or a source-frame link as proof of accuracy. Current model timing requires human verification; do not silently manufacture a replacement timestamp. See `.runtime/verification/remaining-evaluation/evaluation.json` for the local run evidence.

Fresh acceptance run `ipoh-remaining-v7-20261024-001` created incident `1610ff1b-eac8-55f0-9ce1-f58a02e9919f`, with six evidence rows, AHN9916 OCR candidate, and saved risk fields. The unsupported event marker was withheld. No new environment variables are required.
