import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, ChevronLeft, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  EmptyState,
  MapCanvas,
  SectionHeading,
} from "../../_components/page-elements";
import { formatDateTime } from "../../_lib/format";
import { ReviewStatusBadge } from "../../incidents/_components/incident-status";
import { getCamera } from "../_queries/cameras";

export const metadata: Metadata = { title: "Camera Detail" };

export default async function CameraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCamera(id);
  if (!data) notFound();
  const { camera } = data;
  return (
    <>
      <Link
        href="/cameras"
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="size-4" />
        Back to cameras
      </Link>
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-bold text-slate-900">
            {camera.name}
          </h1>
          <Badge
            tone={
              camera.status === "online"
                ? "success"
                : camera.status === "offline"
                  ? "danger"
                  : "neutral"
            }
          >
            {camera.status}
          </Badge>
          <Badge tone={camera.enabled ? "teal" : "neutral"}>
            {camera.enabled ? "Monitoring enabled" : "Monitoring disabled"}
          </Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-400">{camera.id}</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionHeading title="Camera information" />
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[130px_1fr] gap-y-3 text-xs">
              <dt className="text-slate-500">Connectivity</dt>
              <dd>{camera.status}</dd>
              <dt className="text-slate-500">Monitoring</dt>
              <dd>
                {camera.enabled ? "Enabled" : "Disabled"} (not a connectivity
                signal)
              </dd>
              <dt className="text-slate-500">Last seen</dt>
              <dd>{formatDateTime(camera.lastSeenAt)}</dd>
              <dt className="text-slate-500">Coordinates</dt>
              <dd>
                {camera.latitude == null
                  ? "Unavailable"
                  : `${camera.latitude.toFixed(6)}, ${camera.longitude?.toFixed(6)}`}
              </dd>
              <dt className="text-slate-500">Location source</dt>
              <dd>
                {camera.locationSource === "simulated"
                  ? "Simulated Bordeaux metadata"
                  : "Source metadata"}
              </dd>
            </dl>
          </CardContent>
        </Card>
        <MapCanvas cameras={[camera]} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionHeading title="Recent detections" />
          </CardHeader>
          {data.detections.length ? (
            <div className="divide-y">
              {data.detections.map((detection) => (
                <div key={detection.id} className="px-5 py-3 text-xs">
                  <p className="font-semibold">
                    Activity {formatDateTime(detection.activity_start_at)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">
                    {detection.id}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Camera}
              title="No detections"
              description="No activity detections are associated with this camera."
            />
          )}
        </Card>
        <Card>
          <CardHeader>
            <SectionHeading title="Associated incidents" />
          </CardHeader>
          {data.incidents.length ? (
            <div className="divide-y">
              {data.incidents.map((incident) => (
                <Link
                  href={`/incidents/${incident.id}`}
                  key={incident.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-700">
                      Incident {incident.id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDateTime(incident.occurred_at)}
                    </p>
                  </div>
                  <ReviewStatusBadge value={incident.review_status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MapPin}
              title="No incidents"
              description="No suspected incidents are associated with this camera."
            />
          )}
        </Card>
      </div>
    </>
  );
}
