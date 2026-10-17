import type { Metadata } from "next";
import { Camera, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  EmptyState,
  MapCanvas,
  MetricCard,
  PageHeader,
  PreviewNotice,
  SectionHeading,
} from "../_components/page-elements";
import { getDashboardSnapshot } from "../_queries/dashboard";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const data = await getDashboardSnapshot();
  const confirmed = data.incidents.filter(
    (item) => item.reviewStatus === "confirmed",
  ).length;
  const pending = data.incidents.filter(
    (item) =>
      item.reviewStatus === "pending_review" ||
      item.reviewStatus === "needs_investigation",
  ).length;
  const closed = data.incidents.filter(
    (item) => item.reviewStatus === "dismissed",
  ).length;

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
      <PreviewNotice />
      <section
        aria-label="Incident metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          href="/incidents"
          label="Suspected incidents"
          value={data.incidents.length}
          hint="No live source connected"
          icon={ShieldAlert}
        />
        <MetricCard
          href="/incidents?status=confirmed"
          label="Confirmed incidents"
          value={confirmed}
          hint="Reviewed by operators"
          icon={CheckCircle2}
          tone="teal"
        />
        <MetricCard
          href="/review"
          label="Pending review"
          value={pending}
          hint="Awaiting operator review"
          icon={Clock3}
          tone="amber"
        />
        <MetricCard
          href="/incidents?status=dismissed"
          label="Dismissed incidents"
          value={closed}
          hint="Closed after review"
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
            <MapCanvas />
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
            <EmptyState
              title="No incidents to show"
              description="Recent suspected incidents will appear after authenticated Supabase queries are connected."
            />
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
                    0 online
                  </p>
                  <p>
                    <span className="mr-2 inline-block size-2 rounded-full bg-red-500" />
                    0 offline
                  </p>
                  <p>
                    <span className="mr-2 inline-block size-2 rounded-full bg-slate-400" />
                    0 unknown
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
                aria-label="No detection activity data"
              >
                {[0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((value, index) => (
                  <span
                    className="w-full rounded-t bg-slate-100"
                    style={{ height: `${Math.max(4, value)}%` }}
                    key={index}
                  />
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-slate-400">
                No activity data available
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
