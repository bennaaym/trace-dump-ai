# Project context

TraceDump AI is an AI-assisted waste-dumping detection and investigation project. Its intended flow is: a Python worker monitors XProtect sources, applies motion and object detection, requests Hafnia analysis against recording references, extracts useful evidence, and persists suspected incidents to Supabase. A Next.js application will let investigators review those records and evidence.

The existing local worker has been migrated into `video-analytics/` with its mocked regression suite. It provides XProtect discovery/acquisition/export, activity detection, Hafnia analysis, local evidence extraction, and simulation-run deduplication. Live integrations still depend on separately installed SDKs, credentials, model weights, and local services. Supabase persistence, authentication, and investigator workflows are not implemented, and AI-positive results remain suspected incidents requiring human review.


## Selective Mohsin integration (2026-10-25)

User requested only features 1?4 on latest main and explicitly excluded Mohsin report generation. Integration started from origin/main 54bfe42 and selected changes from Mohsin af888db; report route/renderer/tests/header link excluded. Shared pipeline retains alarms, settle timing, attempts and deduplication. Evidence types/queries/strip restored alongside main cleanup association. Cleanup, simulation, live-camera and reports implementations unchanged. See docs/FEATURES_1_TO_4_INTEGRATION.md.

Checks: 136 Python tests/Ruff, 69 frontend logic tests, all required web checks/build; isolated SQL tests cover automatic queue plus idempotent requests and priority security/history. Real authenticated production-build smoke checks passed current incident plus operations/incidents/cleanup/simulation/reports and confirmed cleanup link. Actual recording seek/play/access renewal passed using browser-only shortened renewal timer. No new Hafnia requests or shared incident mutations made. Historical Ipoh test incident and its Supabase camera row no longer exist, although the enabled camera remains in XProtect. Current registered camera names are CAM-01 through CAM-04 and CAM-02-CLEAN (disabled). Initial stale-ID tests were replaced with current-record read-only checks; do not claim fresh plate/timeline live inference was retested. User will run one fresh video after merge.
