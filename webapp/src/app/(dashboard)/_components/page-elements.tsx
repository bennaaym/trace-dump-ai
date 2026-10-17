import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Database, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CameraRecord, IncidentListItem } from "../_lib/types";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold tracking-widest text-teal-700 uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "navy",
  href,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
  tone?: "navy" | "teal" | "green" | "amber";
  href?: string;
}) {
  const colors = {
    navy: "bg-slate-900 text-white",
    teal: "bg-teal-500 text-white",
    green: "bg-green-500 text-white",
    amber: "bg-amber-400 text-slate-900",
  };
  const content = (
    <Card className="group p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-11 place-items-center rounded-xl",
            colors[tone],
          )}
        >
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="font-heading mt-0.5 text-2xl font-bold text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400">{hint}</p>
        </div>
      </div>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="focus-visible:outline-ring rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

export function SectionHeading({
  title,
  description,
  href,
  linkLabel = "View all",
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-heading text-sm font-bold text-slate-900">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
        >
          {linkLabel}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Database,
  action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center px-5 py-8 text-center">
      <div>
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Icon className="size-5" />
        </span>
        <h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
          {description}
        </p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function MapCanvas({
  large = false,
  cameras = [],
  incidents = [],
}: {
  large?: boolean;
  cameras?: CameraRecord[];
  incidents?: IncidentListItem[];
}) {
  const points = [
    ...cameras.flatMap((item) =>
      item.latitude == null || item.longitude == null
        ? []
        : [
            {
              id: `camera-${item.id}`,
              latitude: item.latitude,
              longitude: item.longitude,
              label: item.name,
              kind: "camera" as const,
            },
          ],
    ),
    ...incidents.flatMap((item) =>
      item.latitude == null || item.longitude == null
        ? []
        : [
            {
              id: `incident-${item.id}`,
              latitude: item.latitude,
              longitude: item.longitude,
              label: item.description,
              kind: "incident" as const,
            },
          ],
    ),
  ];
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return (
    <div
      className={cn(
        "map-grid relative overflow-hidden rounded-lg border",
        large ? "min-h-[520px]" : "min-h-64",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_28%,rgb(20_184_166/18%),transparent_15%),radial-gradient(circle_at_30%_70%,rgb(245_158_11/13%),transparent_13%)]" />
      {points.map((point) => {
        const left =
          points.length === 1
            ? 50
            : 8 +
              ((point.longitude - minLng) / Math.max(maxLng - minLng, 0.001)) *
                84;
        const top =
          points.length === 1
            ? 50
            : 8 +
              ((maxLat - point.latitude) / Math.max(maxLat - minLat, 0.001)) *
                84;
        return (
          <span
            key={point.id}
            title={point.label}
            className={cn(
              "absolute z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
              point.kind === "incident" ? "bg-red-500" : "bg-teal-600",
            )}
            style={{ left: `${left}%`, top: `${top}%` }}
          />
        );
      })}
      {!points.length && (
        <div className="absolute inset-0 grid place-items-center p-5 text-center">
          <div className="rounded-xl border bg-white/95 p-4 shadow-sm">
            <MapPin className="mx-auto size-5 text-teal-600" />
            <p className="mt-2 text-sm font-semibold text-slate-800">
              No mapped observations
            </p>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Camera coordinates and incident markers will appear after the data
              connection is configured.
            </p>
          </div>
        </div>
      )}
      <Badge tone="neutral" className="absolute right-3 bottom-3 bg-white/90">
        {points.length ? `${points.length} mapped records` : "Map preview"}
      </Badge>
    </div>
  );
}
