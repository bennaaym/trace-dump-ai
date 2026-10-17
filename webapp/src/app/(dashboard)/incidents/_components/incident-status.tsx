import { Badge } from "@/components/ui/badge";
import { classificationLabel, reviewStatusLabel } from "../../_lib/format";
import type { IncidentClassification, ReviewStatus } from "../../_lib/types";

export function ClassificationBadge({
  value,
}: {
  value: IncidentClassification;
}) {
  const tone =
    value === "dynamic_dumping"
      ? "info"
      : value === "static_dumping"
        ? "teal"
        : "neutral";
  return <Badge tone={tone}>{classificationLabel(value)}</Badge>;
}

export function ReviewStatusBadge({ value }: { value: ReviewStatus }) {
  const tone = {
    pending_review: "warning",
    confirmed: "success",
    dismissed: "neutral",
    needs_investigation: "info",
  }[value] as "warning" | "success" | "neutral" | "info";
  return <Badge tone={tone}>{reviewStatusLabel(value)}</Badge>;
}
