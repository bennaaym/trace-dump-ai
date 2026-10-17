# TraceDump AI contributor instructions

Read this file and the applicable documents under `.ai/rules/` before changing code.

## Purpose and ownership

TraceDump AI is intended to help investigators identify suspected waste-dumping events in surveillance recordings. AI results are leads for human review, not confirmed incidents.

- `webapp/` owns the Next.js application, server-side application logic, and investigator workflows.
- `video-analytics/` owns video acquisition, detection, Hafnia analysis, evidence extraction, and worker orchestration.
- `database/` owns Supabase PostgreSQL migrations and future storage policy definitions.
- `.ai/rules/` contains coding and architecture rules. `.ai/context/` contains project context. `.ai/skills/` is reserved for official hackathon skills.

## Frontend conventions

Follow `.ai/rules/frontend.md`. Colocate feature-specific UI, actions, queries, schemas, and hooks with their routes under `webapp/src/app/`. Keep only shadcn primitives and truly reusable components in `webapp/src/components/`. Fetch in Server Components by default. Use validated `next-safe-action` Server Actions for mutations.

## Python boundaries

Follow `.ai/rules/python.md`. Keep acquisition in `xprotect`, computer-vision detection in `detection`, Hafnia integration in `hafnia`, evidence selection in `evidence`, persistence in `db`, and orchestration in `workers`. Do not blur these boundaries or fabricate model outputs.

## Data and integrations

Follow `.ai/rules/architecture.md`. Database changes belong in versioned files under `database/migrations/`. Never expose XProtect, Hafnia, or Supabase service-role credentials to browser code. Do not change live XProtect configuration, contact Hafnia, connect to production Supabase, or download model weights unless the task explicitly authorizes it.

## Checks

- Webapp: from `webapp/`, run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm knip`, and `pnpm build`.
- Python: from `video-analytics/`, run `python -m pytest` and `python -m ruff check .`; use `python -m ruff format --check .` for formatting verification.

Document new runtime variables in `.env.example`. The root `.env` is local-only and is not automatically loaded by either runtime.
