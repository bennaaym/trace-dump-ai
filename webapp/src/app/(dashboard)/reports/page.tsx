import type { Metadata } from "next";
import {
  ChartNoAxesCombined,
  CheckCircle2,
  CircleOff,
  Download,
  Eye,
  ShieldAlert,
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  PreviewNotice,
  SectionHeading,
} from "../_components/page-elements";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Trends, review outcomes and camera-level investigation statistics."
        actions={
          <button
            disabled
            title="Exports require real report data"
            className="bg-primary inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white opacity-50"
          >
            <Download className="size-4" />
            Export
          </button>
        }
      />
      <PreviewNotice compact />
      <div className="my-4 flex flex-wrap gap-3 rounded-xl border bg-white p-3">
        <select className="h-9 rounded-lg border px-3 text-xs">
          <option>Last 30 days</option>
        </select>
        <select
          disabled
          className="h-9 rounded-lg border bg-slate-50 px-3 text-xs"
        >
          <option>All cameras</option>
        </select>
        <select
          disabled
          className="h-9 rounded-lg border bg-slate-50 px-3 text-xs"
        >
          <option>All classifications</option>
        </select>
        <select
          disabled
          className="h-9 rounded-lg border bg-slate-50 px-3 text-xs"
        >
          <option>All review statuses</option>
        </select>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total detections"
          value={0}
          hint="Connected records"
          icon={Eye}
        />
        <MetricCard
          label="Suspected incidents"
          value={0}
          hint="Created from detections"
          icon={ShieldAlert}
          tone="teal"
        />
        <MetricCard
          label="Confirmed"
          value={0}
          hint="Operator reviewed"
          icon={CheckCircle2}
          tone="green"
        />
        <MetricCard
          label="Dismissed"
          value={0}
          hint="Operator reviewed"
          icon={CircleOff}
          tone="amber"
        />
        <MetricCard
          label="Reviews completed"
          value={0}
          hint="Append-only decisions"
          icon={ChartNoAxesCombined}
        />
      </section>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ReportCard title="Incidents over time" />
        <ReportCard title="Static versus dynamic" />
        <ReportCard title="Review status distribution" />
        <ReportCard title="Camera-level incidents" />
      </div>
    </>
  );
}

function ReportCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeading title={title} description="Based on selected filters" />
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={ChartNoAxesCombined}
          title="No report data"
          description="The chart will render from server-side aggregate queries once Supabase is connected."
        />
      </CardContent>
    </Card>
  );
}
