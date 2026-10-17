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
|-- video-analytics/     # Python package scaffold
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

Python 3.11 is the migration baseline; the package currently supports Python 3.11 through 3.13. Create an isolated environment, install the development tools, and run the scaffold:

```bash
cd video-analytics
python -m venv .venv
# Windows: .venv\Scripts\activate
python -m pip install -e ".[dev]"
video-analytics
python -m pytest
python -m ruff check .
python -m ruff format --check .
```

The worker reads configuration from its process environment. A deployment runner or a future, explicitly selected configuration layer must load values; the service does not implicitly read the repository-root `.env`.

## Database and AI guidance

`database/migrations/` will hold ordered Supabase SQL migrations once the schema is designed. It does not contain a speculative schema. Coding rules live in `.ai/rules/`, concise project context is in `.ai/context/project.md`, and `.ai/skills/` is intentionally empty pending the official hackathon skills.

## Current status

This repository contains development tooling and importable application scaffolds only. XProtect monitoring, MOG2/YOLO detection, Hafnia requests, Supabase connectivity, evidence workflows, authentication, and dashboard features have not been migrated or implemented.
