export function validEventOffset(value: number | null, duration: number) {
  if (
    value == null ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    value >= duration
  ) {
    return null;
  }
  return value;
}

export function clampSeekOffset(value: number, duration: number) {
  if (!Number.isFinite(value) || !Number.isFinite(duration) || duration <= 0)
    return 0;
  return Math.min(Math.max(value, 0), duration);
}

export function recordingAccessStatus(
  status: string | undefined,
  expiresAt: string | null | undefined,
  now: number,
): "available" | "preparing" | "unavailable" | "failed" | "expired" {
  if (status === "pending" || status === "preparing") return "preparing";
  if (
    status === "expired" ||
    (status === "available" && expiresAt && Date.parse(expiresAt) <= now)
  )
    return "expired";
  if (status === "available" || status === "failed") return status;
  return "unavailable";
}
