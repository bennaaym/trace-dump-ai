import { Badge } from "@/components/ui/badge";
import { overdueLabel } from "../../_lib/overdue";
import { caseStatusLabel, type CaseStatus } from "../_lib/case-state";

export function CaseStatusBadge({ value }: { value: CaseStatus }) {
  const tone = {
    open: "warning",
    assigned: "info",
    in_progress: "teal",
    resolved: "success",
  }[value] as "warning" | "info" | "teal" | "success";
  return <Badge tone={tone}>{caseStatusLabel(value)}</Badge>;
}

export function OverdueBadge({
  recordedAt,
  now,
}: {
  recordedAt: string;
  now: number;
}) {
  return <Badge tone="danger">{overdueLabel(recordedAt, now)}</Badge>;
}
