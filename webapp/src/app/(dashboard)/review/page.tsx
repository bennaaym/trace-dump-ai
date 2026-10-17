import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClipboardCheck, ImageOff } from "lucide-react";

import { EmptyState, PageHeader } from "../_components/page-elements";
import { formatDateTime } from "../_lib/format";
import { ReviewStatusBadge } from "../incidents/_components/incident-status";
import { getReviewQueue } from "./_queries/review";

export const metadata: Metadata = { title: "Review Queue" };

export default async function ReviewPage() {
  const incidents = await getReviewQueue();
  return (
    <>
      <PageHeader
        title="Review Queue"
        description="AI-detected incidents awaiting careful operator assessment."
      />
      <div className="surface">
        <div className="border-b px-4 py-3 text-xs font-semibold text-slate-500">
          {incidents.length} incident{incidents.length === 1 ? "" : "s"}{" "}
          awaiting operator attention
        </div>
        {incidents.length ? (
          <div className="divide-y">
            {incidents.map((incident) => (
              <article
                key={incident.id}
                className="grid items-center gap-4 p-4 sm:grid-cols-[88px_1fr_auto]"
              >
                <div className="relative grid h-14 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                  {incident.thumbnailUrl ? (
                    <Image
                      src={incident.thumbnailUrl}
                      alt="Incident evidence"
                      fill
                      sizes="88px"
                      className="object-cover"
                    />
                  ) : (
                    <ImageOff className="size-5" />
                  )}
                </div>
                <div>
                  <ReviewStatusBadge value={incident.reviewStatus} />
                  <p className="mt-2 text-xs text-slate-600">
                    {incident.camera.name} ·{" "}
                    {formatDateTime(incident.occurredAt)}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                    {incident.description}
                  </p>
                </div>
                <Link
                  href={`/incidents/${incident.id}`}
                  className="bg-primary rounded-lg px-4 py-2 text-center text-xs font-semibold text-white"
                >
                  Review
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title="The review queue is empty"
            description="No incidents are pending review or marked for further investigation."
          />
        )}
      </div>
    </>
  );
}
