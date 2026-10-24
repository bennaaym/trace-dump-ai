# TraceDump AI webapp

Minimal Next.js App Router scaffold for future investigator workflows. Feature code belongs beside its route under `src/app`; shared shadcn primitives belong in `src/components/ui`.

The app loads local configuration from `webapp/.env.local`, not the repository-root `.env`. Copy only required values from `../.env.example`, and never expose server credentials with a `NEXT_PUBLIC_` prefix.

See the root `README.md`, `AGENTS.md`, and `.ai/rules/frontend.md` for setup and architecture guidance.

## Investigation report download

Open an incident and choose **Download report** in the header. The authenticated, operator-only `GET /api/incidents/[id]/report` returns a self-contained HTML attachment. Open it offline, or use your browser's Print > Save as PDF. This exports the current saved investigation; it does not run Hafnia or export the original recording.

The report contains incident/camera/location metadata (simulated coordinates labelled), UTC timestamps, the AI narrative/limitations/timeline, plate candidates and crops, risk assessment/rule version, human review and priority histories, and an evidence/hash inventory. AI observations remain separate from human decisions; an OCR number is a candidate, not verified vehicle involvement. Legacy or missing data stays explicitly unknown/unavailable.

Evidence images are embedded from authenticated private Storage downloads, never expiring signed URLs. At most 24 images, 4 MiB each, and 16 MiB total image bytes are included, prioritizing plate crops and event frames. Other or unavailable images remain listed in the inventory. Only JPEG/PNG payloads are embedded. Text is HTML-escaped, the report contains no executable scripts or internal recording/access URLs, and downloads are private/no-store. No new environment variables or migrations are required for reports. Reviewer-priority history still requires its separate existing migration.
