import type { Metadata } from "next";
import {
  ChartNoAxesCombined,
  CheckCircle2,
  CircleOff,
  Eye,
  SearchCheck,
  ShieldAlert,
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  MetricCard,
  PageHeader,
  SectionHeading,
} from "../_components/page-elements";
import { reviewStatusLabel } from "../_lib/format";
import { getReports } from "./_queries/reports";

export const metadata: Metadata = { title: "Insights" };

export default async function ReportsPage() {
  const data = await getReports();
  return (
    <>
      <PageHeader
        title="Insights"
        description="Recorded incident trends, review outcomes and camera-level intelligence."
      />
      <p className="mb-4 text-xs text-slate-500">
        Statistics cover the last 30 days and reflect stored records only.
      </p>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Total detections"
          value={data.detectionCount}
          hint="Activity intervals"
          icon={Eye}
        />
        <MetricCard
          label="Suspected dumping"
          value={data.suspectedCount}
          hint="Awaiting operator review"
          icon={ShieldAlert}
          tone="teal"
        />
        <MetricCard
          label="Needs investigation"
          value={data.investigationCount}
          hint="Further review required"
          icon={SearchCheck}
        />
        <MetricCard
          label="Confirmed incidents"
          value={data.confirmedCount}
          hint="Operator reviewed"
          icon={CheckCircle2}
          tone="green"
        />
        <MetricCard
          label="Dismissed"
          value={data.dismissedCount}
          hint="Operator reviewed"
          icon={CircleOff}
          tone="amber"
        />
        <MetricCard
          label="Reviews completed"
          value={data.reviewCount}
          hint="Append-only decisions"
          icon={ChartNoAxesCombined}
        />
      </section>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ReportCard
          title="Incidents over time"
          values={data.byDay.map((item) => ({
            label: item.day.slice(5),
            value: item.count,
          }))}
        />
        <ReportCard
          title="Incident status distribution"
          values={data.byStatus.map((item) => ({
            label: reviewStatusLabel(item.key),
            value: item.count,
          }))}
        />
        <ReportCard title="Camera-level incidents" values={data.byCamera} />
      </div>
    </>
  );
}

function ReportCard({
  title,
  values,
}: {
  title: string;
  values: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...values.map((item) => item.value));
  return (
    <Card>
      <CardHeader>
        <SectionHeading title={title} description="Based on selected filters" />
      </CardHeader>
      <CardContent>
        {values.some((item) => item.value > 0) ? (
          <div className="space-y-3">
            {values.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[120px_1fr_28px] items-center gap-3 text-xs"
              >
                <span className="truncate text-slate-500 capitalize">
                  {item.label}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-teal-500"
                    style={{ width: `${(item.value / max) * 100}%` }}
                  />
                </span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-36 place-items-center text-center text-xs text-slate-400">
            <div>
              <ChartNoAxesCombined className="mx-auto mb-2 size-5" />
              No records in this period
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
