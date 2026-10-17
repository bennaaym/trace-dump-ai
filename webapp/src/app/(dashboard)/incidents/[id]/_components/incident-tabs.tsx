"use client";

import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  CircleOff,
  FileClock,
  Image as ImageIcon,
  Play,
  SearchCheck,
} from "lucide-react";

import { EmptyState } from "../../../_components/page-elements";
import { cn } from "@/lib/utils";

const tabs = [
  "Overview",
  "Evidence",
  "Video",
  "AI Analysis",
  "Review History",
] as const;

export function IncidentTabs({ incidentId }: { incidentId: string }) {
  const [active, setActive] = useState<(typeof tabs)[number]>("Overview");
  return (
    <div className="surface overflow-hidden">
      <div
        role="tablist"
        aria-label="Incident detail sections"
        className="overflow-x-auto border-b px-4"
      >
        <div className="flex min-w-max">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={active === tab}
              key={tab}
              onClick={() => setActive(tab)}
              className={cn(
                "border-b-2 px-4 py-3 text-xs font-semibold",
                active === tab
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="p-5">
        +{" "}
        {active === "Overview" && (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <UnavailableVideo incidentId={incidentId} />
            <div className="rounded-xl border bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-800">
                Incident information
              </h3>
              <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-3 text-xs">
                <dt className="text-slate-500">Classification</dt>
                <dd>Unavailable</dd>
                <dt className="text-slate-500">Camera</dt>
                <dd>Unavailable</dd>
                <dt className="text-slate-500">Occurred at</dt>
                <dd>Unavailable</dd>
                <dt className="text-slate-500">Location</dt>
                <dd>Unavailable</dd>
              </dl>
            </div>
          </div>
        )}
        {active === "Evidence" && (
          <EmptyState
            icon={ImageIcon}
            title="No evidence available"
            description="Evidence metadata and authenticated signed asset URLs will be loaded from the private incident-evidence bucket."
          />
        )}
        {active === "Video" && <UnavailableVideo incidentId={incidentId} />}
        {active === "AI Analysis" && (
          <EmptyState
            icon={Bot}
            title="AI analysis unavailable"
            description="Structured Hafnia output will appear here with an explicit AI-generated disclaimer. No conclusion is fabricated for this record."
          />
        )}
        {active === "Review History" && (
          <EmptyState
            icon={FileClock}
            title="No review history"
            description="Append-only operator review records will appear after authenticated Supabase access is configured."
          />
        )}
      </div>
    </div>
  );
}

function UnavailableVideo({ incidentId }: { incidentId: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl bg-slate-950 p-6 text-center text-white">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-white/10">
          <Play className="size-5" />
        </span>
        <p className="mt-3 text-sm font-semibold">Recording unavailable</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
          No server-side recording metadata was found for incident {incidentId}.
          Internal recording URLs are never exposed to the browser.
        </p>
      </div>
    </div>
  );
}

export function ReviewActions() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2">
        <SearchCheck className="size-5 text-teal-600" />
        <h2 className="font-heading text-sm font-bold">Operator review</h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Preview only. Decisions cannot be saved until authenticated Supabase
        review actions are connected.
      </p>
      <textarea
        aria-label="Review notes"
        placeholder="Add optional review notes…"
        className="mt-4 min-h-24 w-full resize-y rounded-lg border p-3 text-sm"
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          onClick={() => setSelected("confirm")}
          type="button"
          className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
        >
          <CheckCircle2 className="mr-1.5 inline size-4" />
          Confirm
        </button>
        <button
          onClick={() => setSelected("dismiss")}
          type="button"
          className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white"
        >
          <CircleOff className="mr-1.5 inline size-4" />
          Dismiss
        </button>
        <button
          onClick={() => setSelected("investigate")}
          type="button"
          className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700"
        >
          Needs investigation
        </button>
      </div>
      {selected && (
        <div
          role="dialog"
          aria-modal="false"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <strong>Confirm {selected}?</strong>
          <p className="mt-1">Saving is disabled in preview mode.</p>
          <div className="mt-3 flex gap-2">
            <button
              disabled
              className="rounded bg-slate-900 px-3 py-1.5 text-white opacity-50"
            >
              Save decision
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded border bg-white px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
