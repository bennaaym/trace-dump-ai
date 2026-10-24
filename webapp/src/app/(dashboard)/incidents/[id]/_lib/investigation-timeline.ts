import type { IncidentDetail } from "../../../_lib/types";

interface TimelineObservation {
  id: string;
  claim: string;
  offset: number | null;
  frame: IncidentDetail["evidence"][number] | null;
}

export function investigationTimeline(
  response: string | null,
  duration: number,
  evidence: IncidentDetail["evidence"],
  requireEventReference = false,
) {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(
      (response ?? "").replace(/^```json\s*|\s*```$/g, ""),
    );
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      value = parsed as Record<string, unknown>;
  } catch {
    /* Legacy narrative responses have no observation timeline. */
  }
  const observations: TimelineObservation[] = [];
  const seen = new Set<string>();
  if (
    value.schema_version === "investigation_v1" &&
    Array.isArray(value.observations)
  ) {
    for (const item of value.observations.slice(0, 12)) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !/^[a-z0-9-]{1,64}$/i.test(item.id) ||
        seen.has(item.id) ||
        typeof item.claim !== "string" ||
        !item.claim.trim()
      )
        continue;
      seen.add(item.id);
      const offset =
        typeof item.offset_seconds === "number" &&
        Number.isFinite(item.offset_seconds) &&
        item.timing_basis !== "unknown" &&
        item.offset_seconds >= 0 &&
        item.offset_seconds < duration
          ? item.offset_seconds
          : null;
      const frame =
        offset == null
          ? null
          : (evidence.find(
              (frame) =>
                frame.metadata.observation_id === item.id &&
                frame.offsetSeconds != null &&
                Math.abs(frame.offsetSeconds - offset) <= 0.5,
            ) ?? null);
      observations.push({
        id: item.id,
        claim: item.claim.slice(0, 2000),
        offset,
        frame,
      });
    }
  }
  observations.sort((a, b) => (a.offset ?? Infinity) - (b.offset ?? Infinity));
  const strings = (key: string) =>
    Array.isArray(value[key])
      ? (value[key] as unknown[])
          .filter(
            (entry): entry is string =>
              typeof entry === "string" && Boolean(entry.trim()),
          )
          .slice(0, 12)
          .map((entry) => entry.slice(0, 2000))
      : [];
  const warnings = strings("contradictions");
  if (
    value.event_offset_seconds != null &&
    (requireEventReference || "event_observation_id" in value)
  ) {
    const reference = observations.find(
      (item) => item.id === value.event_observation_id,
    );
    if (
      typeof value.event_offset_seconds !== "number" ||
      reference?.offset == null ||
      Math.abs(reference.offset - value.event_offset_seconds) >= 0.001
    )
      warnings.push(
        "Event time withheld: a consistent, timed release observation was not supplied.",
      );
  }
  if (
    value.dumping_detected === "yes" &&
    "deposit_observed" in value &&
    value.deposit_observed !== "yes"
  ) {
    warnings.push(
      "The model labelled dumping but did not confirm a visible release. Review the recording before deciding.",
    );
  }
  if (
    value.event_offset_seconds != null &&
    value.event_timing_basis === "unknown"
  ) {
    warnings.push(
      "The model supplied an event time without a visible timing basis; that event time is withheld.",
    );
  }
  // A narrow textual conflict check is a review flag, never a new classification.
  if (
    (value.dumping_detected === "yes" ||
      /dumping detected:\s*yes/i.test(response ?? "")) &&
    /no (?:objects?|items?) (?:are |is )?visibly (?:released|deposited|dropped|thrown)|no visible deposit/i.test(
      response ?? "",
    )
  ) {
    warnings.push(
      "The positive classification may conflict with the narrative about no visible deposit. Review the source recording.",
    );
  }
  return {
    observations,
    warnings,
    alternatives: strings("alternative_explanations"),
  };
}
