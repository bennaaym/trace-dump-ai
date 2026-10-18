import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPinned,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  MetricCard,
  PageHeader,
  SectionHeading,
} from "../_components/page-elements";
import { ActivityChart } from "./_components/activity-chart";
import { DateRangeSelect } from "./_components/date-range-select";
import { ReviewOutcomesChart } from "./_components/review-outcomes-chart";
import { normalizeInsightsRange } from "./_lib/insights-data";
import { getInsights } from "./_queries/insights";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = normalizeInsightsRange(stringValue(params.range));
  const data = await getInsights(range, new Date().toISOString());

  return (
    <>
      <PageHeader
        title="Insights"
        description="Recorded dumping activity, camera locations and review progress from stored data."
        actions={<DateRangeSelect value={range} />}
      />

      <section
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Incident summary"
      >
        <MetricCard
          label="Recorded incidents"
          value={data.recordedIncidentCount}
          hint="Distinct incidents in period"
          icon={MapPinned}
        />
        <MetricCard
          label="Confirmed incidents"
          value={data.confirmedIncidentCount}
          hint="Current operator decision"
          icon={CheckCircle2}
          tone="green"
        />
        <MetricCard
          label="Review completion rate"
          value={formatPercentage(data.reviewCompletionRate)}
          hint={`${data.reviewedIncidentCount} of ${data.recordedIncidentCount} incidents reviewed`}
          icon={ShieldCheck}
          tone="teal"
        />
      </section>

      <Card className="mt-5">
        <CardHeader>
          <SectionHeading
            title="Incident activity over time"
            description={`${capitalize(data.aggregation)} counts for the selected period`}
          />
        </CardHeader>
        <CardContent>
          <ActivityChart data={data.activity} aggregation={data.aggregation} />
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card>
          <CardHeader>
            <SectionHeading
              title="Top Camera Locations"
              description="Incident concentration by associated XProtect camera"
            />
          </CardHeader>
          <CardContent>
            {data.locations.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="border-b text-[10px] tracking-wide text-slate-400 uppercase">
                    <tr>
                      <th className="pb-2 font-semibold">Camera</th>
                      <th className="pb-2 text-right font-semibold">
                        Recorded
                      </th>
                      <th className="pb-2 text-right font-semibold">
                        Confirmed
                      </th>
                      <th className="pb-2 text-right font-semibold">Share</th>
                      <th className="w-8 pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.locations.map((location) => (
                      <tr key={location.cameraId}>
                        <td className="py-3 font-semibold text-slate-800">
                          {location.cameraName}
                        </td>
                        <td className="py-3 text-right">{location.total}</td>
                        <td className="py-3 text-right">
                          {location.confirmed}
                        </td>
                        <td className="py-3 text-right text-slate-500">
                          {location.percentage == null
                            ? "—"
                            : formatPercentage(location.percentage)}
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/operations?camera=${encodeURIComponent(location.cameraId)}`}
                            aria-label={`View ${location.cameraName} on Monitor`}
                            className="inline-grid size-7 place-items-center rounded-md text-teal-700 hover:bg-teal-50"
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyInsight
                title="No camera locations to rank"
                description="No recorded incidents are associated with cameras in this period."
              />
            )}
            <p className="mt-3 border-t pt-3 text-[10px] leading-4 text-slate-400">
              Locations use the current simulated XProtect camera coordinates
              and show recorded incident concentration, not precise dumping
              hotspots or geographic risk.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading
              title="Review outcomes"
              description="Current status of each distinct incident"
            />
          </CardHeader>
          <CardContent>
            <ReviewOutcomesChart data={data.outcomes} />
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
              <CompactStat
                label="Pending workload"
                value={String(data.pendingWorkload)}
                icon={Clock3}
              />
              <CompactStat
                label="Median first review"
                value={formatDuration(data.medianFirstReviewMs)}
                icon={ShieldCheck}
                note={
                  data.medianFirstReviewMs == null
                    ? `Needs at least 2 valid reviews; ${data.validReviewDurationCount} available`
                    : undefined
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <SectionHeading
            title="Analysis quality"
            description="Technical Hafnia processing health, separate from incident outcomes"
          />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <QualityStat
              label="Completed analyses"
              value={data.analysisQuality.completed}
              icon={BrainCircuit}
              description="Finished with a classification"
            />
            <QualityStat
              label="Failed analyses"
              value={data.analysisQuality.failed}
              icon={AlertTriangle}
              description="Technical processing failures"
            />
            <QualityStat
              label="Uncertain analyses"
              value={data.analysisQuality.uncertain}
              icon={ShieldCheck}
              description="Completed analyses classified uncertain"
            />
          </div>
          {data.analysisQuality.inProgress > 0 && (
            <p className="mt-3 text-[10px] text-slate-500">
              {data.analysisQuality.inProgress} analysis
              {data.analysisQuality.inProgress === 1 ? " is" : "es are"} pending
              or processing.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CompactStat({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: string;
  icon: typeof ShieldCheck;
  note?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
        <Icon className="size-3.5 text-teal-700" /> {label}
      </span>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
      {note && (
        <p className="mt-1 text-[9px] leading-3 text-slate-400">{note}</p>
      )}
    </div>
  );
}

function QualityStat({
  label,
  value,
  icon: Icon,
  description,
}: {
  label: string;
  value: number;
  icon: typeof ShieldCheck;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-slate-50/50 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-teal-700 shadow-sm">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-lg leading-none font-bold text-slate-900">{value}</p>
        <p className="mt-1 text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function EmptyInsight({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-36 place-items-center rounded-lg border border-dashed bg-slate-50 p-5 text-center">
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function formatPercentage(value: number | null) {
  if (value == null) return "—";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function formatDuration(value: number | null) {
  if (value == null) return "Insufficient data";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = value / 3_600_000;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
  const days = value / 86_400_000;
  return `${days.toFixed(days < 10 ? 1 : 0)} days`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stringValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
