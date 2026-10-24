export type Priority = "high" | "medium" | "low" | "unknown";
const riskLabels = {
  roadway_blocked: "Roadway blocked",
  pedestrian_path_blocked: "Pedestrian path blocked",
  large_material: "Large discarded material",
  scattered_material: "Scattered discarded material",
  near_entrance_or_crossing: "Near an entrance or crossing",
  visible_smoke: "Visible smoke from discarded material",
  visible_leakage: "Visible leakage from discarded material",
} as const;
const highRisk = new Set([
  "roadway_blocked",
  "pedestrian_path_blocked",
  "visible_smoke",
  "visible_leakage",
]);
export function assessPriority(response: string | null, duration: number) {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(
      (response ?? "").replace(/^```json\s*|\s*```$/g, ""),
    );
    if (
      parsed?.schema_version === "investigation_v1" &&
      parsed.risk_factors &&
      typeof parsed.risk_factors === "object" &&
      !Array.isArray(parsed.risk_factors)
    )
      raw = parsed.risk_factors;
  } catch {
    /* Older analyses have no risk assessment. */
  }
  const factors = Object.entries(riskLabels).map(([key, label]) => {
    const item = raw[key];
    const candidate =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const evidence =
      typeof candidate.evidence === "string"
        ? candidate.evidence.trim().slice(0, 1000)
        : "";
    const status =
      evidence && (candidate.status === "yes" || candidate.status === "no")
        ? candidate.status
        : "unknown";
    const offset =
      typeof candidate.offset_seconds === "number" &&
      Number.isFinite(candidate.offset_seconds) &&
      candidate.offset_seconds >= 0 &&
      candidate.offset_seconds < duration
        ? candidate.offset_seconds
        : null;
    return { key, label, status, evidence, offset };
  });
  const present = factors.filter((f) => f.status === "yes");
  const high = present.filter((f) => highRisk.has(f.key));
  const level: Priority = high.length
    ? "high"
    : present.length
      ? "medium"
      : factors.every((f) => f.status === "no")
        ? "low"
        : "unknown";
  const reasons: string[] = (high.length ? high : present).map((f) => f.label);
  if (level === "low")
    reasons.push("All listed risks explicitly reported absent");
  if (level === "unknown")
    reasons.push("Insufficient observable risk information");
  return { level, reasons, factors, ruleVersion: "observable-risk-v1" };
}
