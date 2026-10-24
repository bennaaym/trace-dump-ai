# TraceDump AI

TraceDump AI detects and helps investigate suspected waste-dumping activity in surveillance recordings. It combines XProtect video monitoring and Hafnia analysis with a Supabase-backed investigator web application. All automated classifications remain subject to human review.

For the Mohsin branch features, demonstration steps, verification results, and pending database setup, see [the feature handoff](docs/MOHSIN_FEATURE_HANDOFF.md).

## Architecture

- **Next.js (`webapp/`)**: investigator workflows, server-rendered queries, and validated Server Action mutations.
- **Python (`video-analytics/`)**: XProtect acquisition, motion/object detection, Hafnia analysis, evidence extraction, and worker orchestration.
- **Supabase (`database/`)**: PostgreSQL records, authentication, and evidence storage, managed through reviewed migrations.
- **External systems**: XProtect supplies recordings; Hafnia analyzes recording references. Their credentials remain server-side.

## Repository structure

```text
.
|-- .ai/                 # Project rules, context, and reserved skill directory
|-- database/            # Supabase migration ownership
|-- video-analytics/     # Migrated Python video analytics worker
|-- webapp/              # Next.js application
|-- .env.example         # Documented configuration contract
`-- AGENTS.md            # Main instructions for coding agents
```

## Webapp

Requires Node.js 20.9 or newer and pnpm. The scaffold was initialized with Next.js 16, React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui configuration, `next-safe-action`, Zod, ESLint, Prettier, and Knip.

```bash
cd webapp
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm format:check
pnpm knip
```

Copy the webapp's relevant values from the root `.env.example` into `webapp/.env.local`; Next.js does not automatically load the root `.env`. Only variables prefixed with `NEXT_PUBLIC_` may be sent to the browser.

## Video analytics

Python 3.11 is the migration baseline; the package currently supports Python 3.11 through 3.13. The migrated worker includes read-only XProtect acquisition/export, MOG2/YOLO activity detection, Hafnia analysis, evidence extraction, and local simulation-run state. Create an isolated environment and install the core development dependencies:

```bash
cd video-analytics
python -m venv .venv
# Windows: .venv\Scripts\activate
python -m pip install -e ".[dev]"
video-analytics --help
python -m pytest
python -m ruff check .
python -m ruff format --check .
```

Install `.[dev,detection]` only when Torch and Ultralytics are required. Model weights and Milestone SDK binaries are not stored in this repository. The worker loads `video-analytics/.env` when present; process variables take precedence. It does not read the repository-root `.env` automatically.

## Database and AI guidance

`database/migrations/` contains ordered Supabase SQL migrations for application records, operator authorization, private evidence and recording storage, review history, and priority adjustments. See [database setup](database/README.md) before applying migrations. Coding rules live in `.ai/rules/`, and project context is in `.ai/context/project.md`.

## Current status

The application includes authenticated camera monitoring, suspected incident review, source-linked investigation timelines, optional local number plate recognition, rule-based priority, recording playback, and downloadable investigation reports. Live operation requires XProtect, Hafnia, Supabase, the local export/transcoding tools, and supported model weights.

The latest real-video test exercised acquisition through the database and UI. Reviewer priority changes and expired-recording requeue still require the two migrations listed in the feature handoff and their live acceptance tests. Hafnia's descriptions and event times remain inconsistent; unsupported event markers are withheld, and all results require human review.
