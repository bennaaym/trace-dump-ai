import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CircleOff, Database, MapPin, PlugZap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

export function PreviewNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900",
        compact ? "p-3 text-xs" : "mb-5 p-4 text-sm",
      )}
    >
      <PlugZap className="mt-0.5 size-4 shrink-0" />
      <div>
        <strong>Data connection pending.</strong> This interface is ready for
        authenticated Supabase queries; operational data and actions are
        intentionally unavailable.
      </div>
    </div>
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

export function MapCanvas({ large = false }: { large?: boolean }) {
  return (
    <div
      className={cn(
        "map-grid relative overflow-hidden rounded-lg border",
        large ? "min-h-[520px]" : "min-h-64",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_28%,rgb(20_184_166/18%),transparent_15%),radial-gradient(circle_at_30%_70%,rgb(245_158_11/13%),transparent_13%)]" />
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
      <Badge tone="neutral" className="absolute right-3 bottom-3 bg-white/90">
        Map preview
      </Badge>
    </div>
  );
}

export function EmptyTable({
  columns,
  title,
  description,
}: {
  columns: string[];
  title: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-180 text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((column) => (
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold"
                  key={column}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <EmptyState icon={CircleOff} title={title} description={description} />
    </div>
  );
}
