import type { Metadata } from "next";
import { Download, Search } from "lucide-react";

import {
  EmptyTable,
  PageHeader,
  PreviewNotice,
} from "../_components/page-elements";

export const metadata: Metadata = { title: "Incidents" };

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Search, filter and investigate AI-generated suspected dumping events."
        actions={
          <button
            disabled
            className="bg-primary inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
            title="Export requires connected data"
          >
            <Download className="size-4" />
            Export
          </button>
        }
      />
      <PreviewNotice compact />
      <form
        className="my-4 grid gap-3 rounded-xl border bg-white p-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(4,160px)_auto]"
        action="/incidents"
      >
        <label className="relative">
          <span className="sr-only">Search incidents</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={typeof params.q === "string" ? params.q : ""}
            placeholder="Search incident ID, description or camera"
            className="h-9 w-full rounded-lg border bg-slate-50 pr-3 pl-9 text-sm"
          />
        </label>
        <Filter
          name="classification"
          label="All classifications"
          options={["static", "dynamic", "unknown"]}
          value={params.classification}
        />
        <Filter
          name="status"
          label="All review statuses"
          options={[
            "pending_review",
            "confirmed",
            "dismissed",
            "needs_investigation",
          ]}
          value={params.status}
        />
        <Filter
          name="camera"
          label="All cameras"
          options={[]}
          value={params.camera}
          disabled
        />
        <label>
          <span className="sr-only">Start date</span>
          <input
            type="date"
            name="from"
            className="h-9 w-full rounded-lg border bg-white px-3 text-xs text-slate-600"
          />
        </label>
        <button className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white">
          Apply
        </button>
      </form>
      <EmptyTable
        columns={[
          "Thumbnail",
          "Incident type",
          "Camera / location",
          "Date & time",
          "Review status",
          "Actions",
        ]}
        title="No incidents found"
        description="No incident records are available. Filters are encoded in the URL and will work when the server-side data source is configured."
      />
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>0 results</span>
        <div className="flex gap-2">
          <button
            disabled
            className="rounded-md border bg-white px-3 py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="bg-primary rounded-md px-3 py-1.5 text-white">
            1
          </span>
          <button
            disabled
            className="rounded-md border bg-white px-3 py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}

function Filter({
  name,
  label,
  options,
  value,
  disabled = false,
}: {
  name: string;
  label: string;
  options: string[];
  value: string | string[] | undefined;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={typeof value === "string" ? value : ""}
      disabled={disabled}
      className="h-9 rounded-lg border bg-white px-3 text-xs text-slate-600 disabled:bg-slate-50"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
