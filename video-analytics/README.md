# TraceDump video analytics

This package contains the migrated TraceDump worker for read-only XProtect acquisition, MOG2/YOLO activity detection, Hafnia analysis, and local incident evidence extraction. It does not change XProtect camera configuration or persist to Supabase yet.

## Package layout

- `xprotect/`: REST discovery/live JPEGs, MIP `JPEGLiveSource`, and MIP recording export.
- `detection/`: MOG2 motion analysis, YOLO actor detection, and activity sessions.
- `hafnia/`: gateway client and the versioned dumping prompt.
- `evidence/`: before/event/after keyframe extraction from exported recordings.
- `workers/`: quota-aware orchestration, deduplication state, and suspected-incident assembly.
- `db/`: reserved for later Supabase persistence.

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

Copy `../.env.example` to `video-analytics/.env` and fill in local credentials. Process environment variables take precedence. XProtect and Hafnia credentials remain server-side and are never passed as command-line arguments to the native helpers.

The MIP live/export bridges compile their small C# sources on demand using the Windows .NET Framework compiler and assemblies from `XPROTECT_MIPSDK_DIR`. Generated executables are ignored by Git. Recording validation also requires `ffprobe` on `PATH`.

## Commands

```powershell
video-analytics cameras
video-analytics check
video-analytics analyze --camera CAMERA --start 2026-10-16T14:45:14Z --end 2026-10-16T14:45:28Z
video-analytics export --camera CAMERA --start 2026-10-16T14:45:14Z --end 2026-10-16T14:45:28Z
video-analytics monitor --camera CAMERA --dry-run --duration 60 --fps 5 --detect --yolo-model C:\models\yolo11n.pt
```

`--camera` accepts a GUID, exact camera name, or the 1-based index from `cameras`. Monitoring requires `--dry-run` unless an explicit simulation run and positive Hafnia request cap are provided. AI-positive results are written as `pending_review`; they are not treated as confirmed incidents.

## Checks

```powershell
python -m pytest
python -m ruff check .
python -m ruff format --check .
```
