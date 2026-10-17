# TraceDump AI

TraceDump AI is a foundation for detecting and investigating suspected waste-dumping activity in surveillance recordings. The planned system combines video monitoring and AI-assisted analysis with an investigator-facing web application. All automated classifications remain subject to human review.

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

`database/migrations/` will hold ordered Supabase SQL migrations once the schema is designed. It does not contain a speculative schema. Coding rules live in `.ai/rules/`, concise project context is in `.ai/context/project.md`, and `.ai/skills/` is intentionally empty pending the official hackathon skills.

## Current status

The existing Python worker and mocked tests are migrated into the package structure. Its live XProtect, Hafnia, MIP SDK, ffprobe, and YOLO paths still require the corresponding local services, tools, credentials, and model weights. Supabase persistence, authentication, and dashboard features remain unimplemented.
