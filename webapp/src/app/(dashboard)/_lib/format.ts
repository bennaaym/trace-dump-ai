import type { ReviewStatus } from "./types";

export function formatDateTime(value: string | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function reviewStatusLabel(value: ReviewStatus): string {
  return {
    pending_review: "Suspected dumping",
    confirmed: "Confirmed incident",
    dismissed: "Dismissed",
    needs_investigation: "Needs investigation",
  }[value];
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
