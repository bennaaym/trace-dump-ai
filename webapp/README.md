# TraceDump AI webapp

Minimal Next.js App Router scaffold for future investigator workflows. Feature code belongs beside its route under `src/app`; shared shadcn primitives belong in `src/components/ui`.

The app loads local configuration from `webapp/.env.local`, not the repository-root `.env`. Copy only required values from `../.env.example`, and never expose server credentials with a `NEXT_PUBLIC_` prefix.

See the root `README.md`, `AGENTS.md`, and `.ai/rules/frontend.md` for setup and architecture guidance.
