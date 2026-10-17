export function sanitizeDetectorMetadata(metadata: Record<string, unknown>) {
  const config = isRecord(metadata.detector_config)
    ? Object.fromEntries(
        Object.entries(metadata.detector_config).filter(
          ([key]) =>
            !/(path|uri|url|model|secret|token|password|credential)/i.test(key),
        ),
      )
    : undefined;
  return Object.fromEntries(
    [
      ["detector", metadata.detector],
      ["hit_count", metadata.hit_count],
      ["model_device", metadata.model_device],
      ["actor_classes", metadata.actor_classes],
      ["detector_config", config],
    ].filter((entry) => entry[1] !== undefined),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
