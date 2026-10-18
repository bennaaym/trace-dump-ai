import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Database } from "lucide-react";

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
