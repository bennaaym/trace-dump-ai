# Features 1–4 integration

25 October 2026 (UTC). Based on `origin/main` commit `54bfe42`, with selected changes from `Mohsin` (`af888db`).

## Scope

1. Playback access renewal with position/paused-state preservation, safe seeking, and expired-recording requeue handling.
2. Validated event offsets, source-linked investigation observations, evidence frames, and explicit unknown/contradictory model output handling.
3. Separate number plate evidence cards with crop/source links and unreadable states; optional local ONNX detection/OCR.
4. Deterministic automatic risk priority plus authenticated reviewer adjustments/reset and append-only history.

The Mohsin report route, HTML report renderer/tests, and Download report button are deliberately excluded. Main's existing reports/insights files are unchanged. Main's cleanup pages, live-camera/operations pages, demo lab, scene-check/simulation workers, and incident cleanup-link page are also unchanged.

Conflicts were reconciled in the shared incident pipeline, playback UI, and investigation data. Evidence reads/types and the evidence strip were restored to support the requested timeline and plate features, alongside main's cleanup association. The pipeline retains XProtect alarm publication, request-attempt diagnostics, recording-settle configuration, and run deduplication. The automatic recording queue migration remains intact.

## Verification

- 136 Python tests passed, including a new synthetic integration regression exercising structured observations, optional plate scanning, alarm publication, and suppression of a repeated session together. Ruff lint and formatting passed.
- 69 frontend logic tests passed. Lint, typecheck, formatting, Knip, and the production build passed. Route types were regenerated after excluding the report route to remove stale local build references.
- Local PostgreSQL-compatible tests passed for priority authorization/history/stale writes/reset, playback requeue states, and coexistence with main's automatic queue without duplicate recording rows. These use isolated synthetic fixtures.
- An isolated priority browser fixture passed automatic risk reasons, supporting seek links, adjustment/reset action payloads, history, and unknown/missing-migration states.
- Authenticated browser checks on the production build passed for Operations, Incidents, Cleanup, Demo Lab, and Reports/Insights. A confirmed incident retained its linked cleanup case.
- Current incident `4a247723-6aa2-5292-a846-4354c07b3828` rendered legacy data correctly: no fabricated plate reading or structured observations, automatic priority Unknown, and available reviewer controls. Its real recording loaded, sought to 3 seconds, played, and retained a paused position of 6 seconds across access renewal. Only the first access-response TTL was shortened in the test browser to exercise renewal promptly; database retention and incident data were not changed.
- The earlier Ipoh test incident `1610ff1b-eac8-55f0-9ce1-f58a02e9919f` no longer exists in the shared database. Initial checks against that stale ID correctly displayed Incident not found. No old incident or result was recreated to satisfy the test. No new Hafnia request was submitted during this integration.

Local test artifacts remain under `.runtime/verification/merged-*` and are excluded from Git. Tests establish these integration behaviors, not perfect AI accuracy or every possible deployment state.

## Database requirements

The development project already contains the priority adjustment table and the previously applied expired-playback requeue function. For another environment, apply the versioned migration history, including:

- `20261023190000_requeue_expired_incident_recordings.sql`
- `20261024000000_incident_priority_adjustments.sql`
- Main's existing `20261024180000_queue_incident_recordings_automatically.sql`

The automatic queue inserts one pending recording per new incident. The request RPC reuses that row and requeues failed/expired derivatives. Reviewer priority does not alter incident confirmation or immutable model output.

## Manual video test

The shared database currently contains CAM-01 through CAM-04 and the disabled CAM-02-CLEAN. CAM-01's name/ID is absent from this workstation's configured XProtect, so it cannot be used directly with this local worker. Use an enabled camera registered in both the worker's XProtect server and Supabase. The old `demo_real_dumping_plate_ipoh` still exists and is enabled locally in XProtect, but its Supabase registration is absent; re-register only that camera before using it for a database/UI test. Do not blindly synchronize all camera records in a shared project. This environment prerequisite is separate from the merge; existing team camera records were left untouched.

Run the UI (`pnpm dev` from `webapp/`) and a playback worker in a separate terminal:

```powershell
Set-Location D:\trace-dump-ai\video-analytics
.\.venv\Scripts\video-analytics.exe playback-worker
```

Once the Ipoh camera has been re-registered in Supabase, run one analysis in another PowerShell terminal. Alternatively, replace its name with a camera verified to exist in both systems:

```powershell
Set-Location D:\trace-dump-ai\video-analytics
$runId = 'main-review-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
.\.venv\Scripts\video-analytics.exe monitor --camera demo_real_dumping_plate_ipoh --duration 45 --fps 5 --detect --yolo-model ".\models\yolo11n.pt" --recognize-plates --simulation-run $runId --max-hafnia-requests 1
```

This requires existing local YOLO and supported plate weights, configured runtime credentials, and a camera with recordings. Check the final classification and database synchronization result. A positive classification creates a suspected incident; negative/uncertain output does not. Open the new incident to check playback, the plate card, automatic priority, and AI Analysis timeline. Change/reset priority with a reason if needed.

The default prompt is `dumping_v7.txt`; an explicit configured prompt path still takes precedence. Missing event references produce no Jump to event marker. Missing or unclear plates stay unavailable/unreadable. Stronger structured prompting has not solved inconsistent AI descriptions or timestamps; the user's fresh video test remains the next live inference acceptance step.
