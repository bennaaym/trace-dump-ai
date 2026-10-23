import { Badge } from "@/components/ui/badge";
import { cleanupStatusLabel } from "../_lib/cleanup-data";
import type { CleanupStatus } from "../_lib/types";

export function CleanupStatusBadge({ status }: { status: CleanupStatus }) {
  const tone = {
    awaiting_cleanup: "warning",
    in_progress: "info",
    verification: "teal",
    resolved: "success",
  }[status] as "warning" | "info" | "teal" | "success";
  return <Badge tone={tone}>{cleanupStatusLabel(status)}</Badge>;
}
