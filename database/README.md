# Database

This directory owns the future Supabase PostgreSQL schema and storage configuration for cameras, activity sessions, analyses, suspected incidents, evidence, and human reviews.

No schema is defined yet. Once the domain model is agreed, create ordered, immutable SQL files in `migrations/` using the Supabase CLI's timestamp naming convention. Develop and test migrations against a local or disposable Supabase environment, review SQL and row-level security policies, then apply the same versioned migrations to shared environments. Never edit production manually or place credentials in migration files.
