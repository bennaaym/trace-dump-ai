import type { IncidentDetail } from "../../../_lib/types";

type Evidence = IncidentDetail["evidence"];
export function plateEvidence(evidence: Evidence, duration: number) {
  const scan = evidence
    .map((frame) => frame.metadata.plate_scan)
    .find((value) => value && typeof value === "object") as
    Record<string, unknown> | undefined;
  const candidates = evidence
    .filter((frame) => frame.metadata.kind === "plate_crop")
    .flatMap((crop) => {
      if (
        crop.offsetSeconds == null ||
        !Number.isFinite(crop.offsetSeconds) ||
        crop.offsetSeconds < 0 ||
        crop.offsetSeconds >= duration
      )
        return [];
      const text =
        crop.metadata.plate_status === "readable" &&
        typeof crop.metadata.plate_text === "string" &&
        /^[A-Z0-9]{4,9}$/.test(crop.metadata.plate_text)
          ? crop.metadata.plate_text
          : null;
      const source =
        evidence.find(
          (frame) =>
            frame.id === crop.metadata.source_frame_id &&
            frame.metadata.kind === "plate_source" &&
            frame.offsetSeconds === crop.offsetSeconds,
        ) ?? null;
      return [{ crop, source, text, offset: crop.offsetSeconds }];
    });
  return {
    candidates,
    status: scan?.status,
    sampled:
      typeof scan?.sampled_frames === "number" ? scan.sampled_frames : null,
  };
}

export function recordingEvidence(evidence: Evidence): Evidence {
  return evidence.filter(
    (frame) =>
      frame.metadata.kind !== "plate_crop" &&
      frame.metadata.kind !== "plate_source",
  );
}
