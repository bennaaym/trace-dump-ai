# Project context

TraceDump AI is an AI-assisted waste-dumping detection and investigation project. Its intended flow is: a Python worker monitors XProtect sources, applies motion and object detection, requests Hafnia analysis against recording references, extracts useful evidence, and persists suspected incidents to Supabase. A Next.js application will let investigators review those records and evidence.

This repository is currently a scaffold. It has no working XProtect, detector, Hafnia, evidence, authentication, or Supabase integration, and it does not claim to detect incidents yet. The existing production-like worker will be migrated in a separate, explicitly scoped task.
