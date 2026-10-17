import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronLeft, MapPin, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  EmptyState,
  MapCanvas,
  SectionHeading,
} from "../../_components/page-elements";
import { getCameraById } from "../../_queries/dashboard";

export const metadata: Metadata = { title: "Camera Detail" };

export default async function CameraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const camera = await getCameraById(id);
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
            Camera {id}
          </h1>
          <Badge>Unavailable</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {camera
            ? "Camera record loaded."
            : "No camera record was found for this ID."}
        </p>
      </header>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader>
            <SectionHeading
              title="Video preview"
              description="Authenticated recording playback"
            />
          </CardHeader>
          <CardContent>
            <div className="grid min-h-80 place-items-center rounded-lg bg-slate-950 text-center text-white">
              <div>
                <Play className="mx-auto size-8 text-slate-500" />
                <p className="mt-3 text-sm font-semibold">
                  Preview unavailable
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  No recording metadata is connected.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <SectionHeading title="Camera information" />
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-xs">
                <dt className="text-slate-500">Connectivity</dt>
                <dd>Unknown</dd>
                <dt className="text-slate-500">Recording</dt>
                <dd>Unknown</dd>
                <dt className="text-slate-500">Monitoring</dt>
                <dd>Not connected</dd>
                <dt className="text-slate-500">Last seen</dt>
                <dd>Unavailable</dd>
                <dt className="text-slate-500">Last analyzed</dt>
                <dd>Unavailable</dd>
              </dl>
            </CardContent>
          </Card>
          <MapCanvas />
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionHeading title="Recent detections" />
          </CardHeader>
          <EmptyState
            icon={Camera}
            title="No detections"
            description="Detections from this camera will appear after integration."
          />
        </Card>
        <Card>
          <CardHeader>
            <SectionHeading title="Associated incidents" />
          </CardHeader>
          <EmptyState
            icon={MapPin}
            title="No incidents"
            description="Linked suspected incidents will appear after integration."
          />
        </Card>
      </div>
    </>
  );
}
