import { Badge } from "@/components/ui/badge";
import { reviewStatusLabel } from "../../_lib/format";
import type { ReviewStatus } from "../../_lib/types";

export function ReviewStatusBadge({ value }: { value: ReviewStatus }) {
  const tone = {
    pending_review: "warning",
    confirmed: "success",
    dismissed: "neutral",
    needs_investigation: "info",
  }[value] as "warning" | "success" | "neutral" | "info";
  return <Badge tone={tone}>{reviewStatusLabel(value)}</Badge>;
}
