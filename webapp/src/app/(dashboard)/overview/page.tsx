import type { Metadata } from "next";
import { Camera, CheckCircle2, SearchCheck, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import {
  EmptyState,
  MapCanvas,
  MetricCard,
  PageHeader,
  SectionHeading,
} from "../_components/page-elements";
import { formatDateTime } from "../_lib/format";
import { ReviewStatusBadge } from "../incidents/_components/incident-status";
import { getOverview } from "./_queries/overview";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const data = await getOverview();

  return (
    <>
      <PageHeader
        title="Overview"
        description="Real-time insight into suspected dumping activity and system readiness."
        actions={
          <label className="text-xs font-semibold text-slate-500">
            Period
            <select className="ml-2 h-9 rounded-lg border bg-white px-3 text-slate-700">
              <option>Last 30 days</option>
            </select>
          </label>
        }
      />
      <section
        aria-label="Incident metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          href="/incidents?status=pending_review"
          label="Suspected dumping"
          value={data.suspectedCount}
          hint="AI leads awaiting review"
          icon={ShieldAlert}
        />
        <MetricCard
          href="/incidents?status=confirmed"
          label="Confirmed incidents"
          value={data.confirmedCount}
          hint="Reviewed by operators"
          icon={CheckCircle2}
          tone="teal"
        />
        <MetricCard
          href="/incidents?status=needs_investigation"
          label="Needs investigation"
          value={data.investigationCount}
          hint="Further review required"
          icon={SearchCheck}
          tone="amber"
        />
        <MetricCard
          href="/cameras?monitoring=enabled"
          label="Monitored cameras"
          value={data.monitoredCount}
          hint="Enabled for monitoring"
          icon={Camera}
          tone="green"
        />
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_1fr_.78fr]">
        <Card>
          <CardHeader>
            <SectionHeading
              title="Incident Hotspots"
              description="Geographic distribution"
              href="/map"
            />
          </CardHeader>
          <CardContent>
            <MapCanvas
              cameras={data.cameras}
              incidents={data.recentIncidents}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionHeading
              title="Recent Incidents"
              description="Latest suspected events"
              href="/incidents"
            />
          </CardHeader>
          <CardContent className="px-0">
            {data.recentIncidents.length ? (
              <div className="divide-y">
                {data.recentIncidents.map((incident) => (
                  <Link
                    key={incident.id}
                    href={`/incidents/${incident.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">
                        {incident.camera.name}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDateTime(incident.occurredAt)}
                      </p>
                    </div>
                    <ReviewStatusBadge value={incident.reviewStatus} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No incidents to show"
                description="Automatically detected suspected incidents will appear here."
              />
            )}
          </CardContent>
        </Card>
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <SectionHeading
                title="Camera Health"
                description="Connectivity overview"
                href="/cameras"
              />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-5">
                <div className="grid size-24 shrink-0 place-items-center rounded-full border-[10px] border-slate-100 text-center">
                  <span className="font-heading text-2xl font-bold">
                    {data.cameras.length}
                  </span>
                </div>
                <div className="space-y-2 text-xs text-slate-500">
                  <p>
                    <span className="mr-2 inline-block size-2 rounded-full bg-green-500" />
                    {
                      data.cameras.filter((item) => item.status === "online")
                        .length
                    }{" "}
                    online
                  </p>
                  <p>
                    <span className="mr-2 inline-block size-2 rounded-full bg-red-500" />
                    {
                      data.cameras.filter((item) => item.status === "offline")
                        .length
                    }{" "}
                    offline
                  </p>
                  <p>
                    <span className="mr-2 inline-block size-2 rounded-full bg-slate-400" />
                    {
                      data.cameras.filter((item) => item.status === "unknown")
                        .length
                    }{" "}
                    unknown
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionHeading
                title="Detection Activity"
                description="Activity over the selected period"
                href="/reports"
              />
            </CardHeader>
            <CardContent>
              <div
                className="flex h-28 items-end gap-2 border-b border-l px-3 pb-2"
                aria-label="Detection activity over the last seven days"
              >
                {data.activity.map((item) => (
                  <span
                    className="w-full rounded-t bg-slate-100"
                    title={`${item.day}: ${item.count}`}
                    style={{ height: `${Math.max(4, item.count * 18)}%` }}
                    key={item.day}
                  />
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-slate-400">
                Detections during the last seven days
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
