# Frontend rules

- Organize features by route under `webapp/src/app/`. Colocate feature-specific `_components`, `_actions`, `_queries`, `_schemas`, and hooks with the route that owns them. Do not create a global `features/` directory.
- Use React Server Components by default. Add `"use client"` only at the smallest interactive boundary.
- Prefer server-side queries and pass minimal serializable data to Client Components.
- Use `next-safe-action` for authenticated, validated Server Action mutations. Define input schemas with Zod and perform authorization on the server.
- Keep TypeScript strict. Do not suppress type or lint errors to make checks pass.
- Use Tailwind CSS for styling and the configured shadcn/ui conventions for primitives. Put shadcn primitives in `src/components/ui/`.
- Keep components small and composable. Promote a component to `src/components/` only when it is genuinely reusable across features.
- Avoid global client state unless multiple distant interactive boundaries truly need it. Prefer URL, server, or local component state.
- Use Route Handlers only for needs that Server Actions do not cover, such as webhooks, streaming, or special HTTP integrations.
