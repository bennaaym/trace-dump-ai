# Mohsin branch: investigation features

Updated 24 October 2026 (UTC). This document describes the implemented branch changes and their verification status for team review. The user has applied the two investigation migrations to the development database, and the remaining live priority and expired-recording acceptance tests passed. Model accuracy limitations remain separate from integration verification.

## Features available for review

| Feature | Behavior |
| --- | --- |
| Recording playback | Prepare the original incident interval as a private browser-compatible recording. Renew expiring access links while preserving playback position and paused state. Queued/preparing recordings are no longer hidden by an old retention deadline. |
| Event navigation | Parse clip-relative timestamps, reject invalid/out-of-range values, and seek only when a usable event offset exists. The current prompt requires a matching timed release observation; unsupported event markers remain unavailable with an explanation. |
| Investigation timeline | Show model observations, approximate times where supplied, linked original frames, alternative explanations, and assessment conflicts in AI Analysis. Historical incidents without structured observations do not receive invented timelines. |
| Number plate evidence | Optional local CPU detector/OCR creates a separate plate card with text or Unreadable, a crop, its original source frame, and a playback link. Plate artifacts are separated from the general evidence strip. Vehicle involvement stays unverified. |
| Automatic priority | Deterministic rules use seven observable risk factors. High: roadway/path obstruction, smoke, or leakage. Medium: large/scattered material or proximity to an entrance/crossing. Low requires all seven explicit no findings; otherwise Unknown. Priority depends on model findings and is not ground truth. |
| Reviewer priority | Operators can set High/Medium/Low with a reason, or restore automatic assessment. Append-only history and stale-write checks protect concurrent reviews. Requires the priority migration, now verified in the development database. |
| Investigation report | Download an authenticated, self-contained HTML report with embedded evidence images, analysis, plate results, priority, review history, and provenance. Open offline and print to PDF. Video is excluded; missing or oversized images are reported rather than silently invented. |
| Versioned detection prompts | Default `dumping_v7.txt` requests visible deposit evidence, structured risks, chronology, and a linked event observation. Requests include the real interval duration. Earlier prompts remain available for provenance. Raw responses and historical classifications are preserved. |

## Data flow and ownership

`XProtect recording → Python activity selection → Hafnia analysis → Python validation/evidence/OCR → Supabase → authenticated Next.js incident page/report`

The Python worker owns acquisition, model integration, evidence extraction, and persistence. Next.js owns investigator presentation and validated operator actions. Supabase owns application data, private objects, and authorization. Credentials stay server-side. A positive model answer creates a suspected incident awaiting human review; negative/uncertain answers do not create an incident just to complete a demonstration.

## Database setup

These migrations have been applied to the existing development database. For another environment where they are absent, apply them in order through its Supabase SQL Editor:

1. [`20261023190000_requeue_expired_incident_recordings.sql`](../database/migrations/20261023190000_requeue_expired_incident_recordings.sql)
2. [`20261024000000_incident_priority_adjustments.sql`](../database/migrations/20261024000000_incident_priority_adjustments.sql)

Open each unapplied file, copy its SQL into a new query in the correct project, and run it. Do not rerun the priority table creation on the already updated development database. These migrations assume the earlier repository migrations already exist. A new environment needs the full ordered migration history; see [database README](../database/README.md). The original workstation also has a combined local script at `.runtime/verification/apply-remaining-migrations.sql`; the versioned files above are the canonical, shared sources.

The configured service-role API key cannot execute arbitrary database DDL. No database management connection was configured, so remote application was left to the project administrator. No incident deletion or fabricated risk backfill is required. The UI handles an absent priority table by disabling adjustments.

After applying SQL in another environment, verify an operator can save a priority with a reason, see history after refresh, and reset to automatic. Verify an expired derivative can be requested again, progress through preparing, and become playable. Both live acceptance paths passed on the development database on 24 October 2026; local migration/security tests also passed.

## Run the real-video demo

Use an environment with the existing XProtect camera registered, matching Supabase setup, local model files, and configured runtime credentials. This camera and its simulated Bordeaux coordinates belong to the current demo environment; they are not provisioned by cloning GitHub.

1. Configure `video-analytics/.env` and `webapp/.env.local` from the documented examples. The root `.env` is not loaded automatically.
2. Install the Python extras needed for detection and plates (`python -m pip install -e ".[dev,detection,plates]"` from `video-analytics/`). Supply supported local weights as described in [plate recognition](../video-analytics/PLATE_RECOGNITION.md). Weights and videos are excluded from Git.
3. Start the UI with `pnpm install` and `pnpm dev` from `webapp/`, and sign in as a configured operator. Run the playback worker described in the [worker README](../video-analytics/README.md) for on-demand recording preparation.
4. From PowerShell, run:

```powershell
Set-Location D:\trace-dump-ai\video-analytics
$runId = 'ipoh-team-review-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
.\.venv\Scripts\video-analytics.exe monitor --camera demo_real_dumping_plate_ipoh --duration 45 --fps 5 --detect --yolo-model ".\models\yolo11n.pt" --recognize-plates --simulation-run $runId --max-hafnia-requests 1
```

The command submits a real Hafnia request when activity is selected. Keep the reported summary/incident IDs and check synchronization errors/pending writes. A fresh positive result should appear in Incidents after refresh. Inspect Overview for plate and priority cards, AI Analysis for observations/conflicts, Prepare recording for playback, and Download report for the offline report. Repeated runs may return different model answers or capture different portions of the looping video.

## Verification completed

- 97 Python tests, Ruff lint, and Ruff format verification passed.
- 57 frontend logic tests passed, along with `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm knip`, and `pnpm build`.
- Local migration tests covered priority authorization, immutable history, stale updates/reset, and recording requeue behavior. These do not replace applying/testing the migrations on Supabase.
- A fresh real XProtect → Hafnia → Supabase → authenticated UI run on 24 October captured 196 unique frames with zero acquisition failures and created suspected incident `1610ff1b-eac8-55f0-9ce1-f58a02e9919f`. Summary: `dab0bdd5-21b1-4e72-b8b4-291df2e6dee9`. Synchronization finished without pending writes.
- That incident displayed OCR `AHN9916`, three source-linked observations, automatic Low priority from the returned risk fields, and a withheld unsupported event marker. The report download and offline embedded images passed authenticated browser checks. Anonymous access was denied.
- A real recording on incident `a227bd1d-cc9e-51be-8b4b-c7ec385390f8` played and sought successfully. Natural five-minute signed-link renewal preserved its paused position at 12 seconds.
- After migration application, the authenticated UI saved Medium on test incident `1610ff1b-eac8-55f0-9ce1-f58a02e9919f`, preserved it after refresh, and restored automatic Low. Both explicitly labeled test adjustments remain in the append-only history; the incident stays pending human review.
- The same incident's recording retention was temporarily expired to exercise the real retry path. Refresh playback requeued it, the API returned preparing despite the old deadline, and a scoped playback worker prepared the recording. The browser loaded the 46.125-second video, and the final database row was available with a future retention deadline. Local artifacts: `.runtime/verification/remaining-priority-expiry-result.json` and `remaining-priority-expiry.png`. No additional Hafnia request was needed.

The live development incident can be opened at `/incidents/1610ff1b-eac8-55f0-9ce1-f58a02e9919f` on an app connected to that same database. Local screenshots, raw evaluations, downloaded reports, and recordings remain on the original workstation under `.runtime/verification/` or `video-analytics/runs/`; they are excluded from the repository.

## Limitations and remaining work

1. Improve and benchmark model accuracy using human-reviewed examples. Controlled prompt comparisons still produced contradictions, repeated timestamps, missing event references, and varying risk findings. Stronger prompts have not solved detection correctness.
2. Validate event timing against the source video. The claimed 0.3-second trunk release contradicted the inspected source frame; the current contract withholds such unsupported event markers. Observation timestamps can still be inaccurate even when they parse successfully.
3. Plate sampling is bounded and may miss brief appearances. OCR text requires visual confirmation and never establishes involvement by itself.

No new runtime environment variables were introduced for these investigation features. Optional plate dependencies are declared in `video-analytics/pyproject.toml`. Source, migrations, tests, and documentation are shared; environment secrets, model weights, runtime exports, and private evidence are not.
