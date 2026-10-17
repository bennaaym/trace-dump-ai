# Project context

TraceDump AI is an AI-assisted waste-dumping detection and investigation project. Its intended flow is: a Python worker monitors XProtect sources, applies motion and object detection, requests Hafnia analysis against recording references, extracts useful evidence, and persists suspected incidents to Supabase. A Next.js application will let investigators review those records and evidence.

The existing local worker has been migrated into `video-analytics/` with its mocked regression suite. It provides XProtect discovery/acquisition/export, activity detection, Hafnia analysis, local evidence extraction, and simulation-run deduplication. Live integrations still depend on separately installed SDKs, credentials, model weights, and local services. Supabase persistence, authentication, and investigator workflows are not implemented, and AI-positive results remain suspected incidents requiring human review.
