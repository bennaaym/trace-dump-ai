import Image from "next/image";

import type { IncidentDetail } from "../../../_lib/types";
import { plateEvidence } from "../_lib/plate-evidence";

export function PlateEvidence({ incident }: { incident: IncidentDetail }) {
  const duration =
    (Date.parse(incident.detection.recordingEndAt) -
      Date.parse(incident.detection.recordingStartAt)) /
    1000;
  const images = plateEvidence(incident.evidence, duration).candidates.filter(
    ({ crop }) => crop.signedUrl,
  );
  if (!images.length) return null;

  return (
    <section
      className="space-y-3 rounded-xl border bg-white p-4"
      aria-label="Number plate evidence"
    >
      <h3 className="font-heading text-base font-bold">
        Number plate evidence
      </h3>
      <div className="grid gap-3">
        {images.map(({ crop }) => (
          <Image
            key={crop.id}
            src={crop.signedUrl!}
            width={384}
            height={128}
            unoptimized
            alt="Detected number plate crop"
            className="aspect-[3/1] w-full rounded-lg border object-contain"
          />
        ))}
      </div>
    </section>
  );
}
