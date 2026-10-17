import type { IncidentClassification, ReviewStatus } from "./types";

export function formatDateTime(value: string | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function classificationLabel(value: IncidentClassification): string {
  return {
    static_dumping: "Static dumping",
    dynamic_dumping: "Dynamic dumping",
    unknown_dumping: "Unknown dumping",
  }[value];
}

export function reviewStatusLabel(value: ReviewStatus): string {
  return {
    pending_review: "Pending review",
    confirmed: "Confirmed",
    dismissed: "Dismissed",
    needs_investigation: "Needs investigation",
  }[value];
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
