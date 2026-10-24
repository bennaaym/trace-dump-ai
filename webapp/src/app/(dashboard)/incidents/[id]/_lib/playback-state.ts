export function validEventOffset(value: number | null, duration: number) {
  if (
    value == null ||
    !Number.isFinite(value) ||
    value <= 0 ||
    duration <= 0 ||
    value > duration
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
