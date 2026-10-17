# Architecture rules

- The Python worker owns video intelligence: monitoring, acquisition, motion/object detection, Hafnia analysis, evidence extraction, concurrency, and deduplication.
- Next.js owns the application layer and investigator workflows. It may perform server-side database access but must not absorb video-processing responsibilities.
- Supabase owns structured application data, evidence object storage, and authentication. Schema and policy changes must be captured as reviewed migrations.
- XProtect is the source of surveillance cameras and recordings. Do not mutate camera configuration as part of application development.
- Hafnia analyzes references to XProtect recordings. Keep its requests and credentials in server-side Python code.
- Never expose XProtect credentials, Hafnia keys, or the Supabase service-role key to browser bundles.
- Treat every AI classification as a suspected incident requiring human review. Product language and data models must preserve that distinction.
- Avoid direct coupling between browser code and surveillance integrations; exchange durable application records through server-side boundaries.
