import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ImageOff, Search } from "lucide-react";

import { EmptyState, PageHeader } from "../_components/page-elements";
import { formatDateTime, shortId } from "../_lib/format";
import { ReviewStatusBadge } from "./_components/incident-status";
import { getIncidents } from "./_queries/incidents";

export const metadata: Metadata = { title: "Incidents" };

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = {
    q: stringValue(params.q),
    status: stringValue(params.status),
    camera: stringValue(params.camera),
    from: stringValue(params.from),
    page: stringValue(params.page),
  };
  const data = await getIncidents(filters);
  const totalPages = Math.max(1, Math.ceil(data.count / data.pageSize));
  const returnTo = incidentsListUrl(params);
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Search, filter and investigate AI-generated suspected dumping events."
      />
      <form
        className="mb-4 grid gap-3 rounded-xl border bg-white p-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(3,160px)_auto]"
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
          name="status"
          label="All incident statuses"
          options={[
            "pending_review",
            "confirmed",
            "dismissed",
            "needs_investigation",
          ]}
          optionLabels={{
            pending_review: "Suspected dumping",
            confirmed: "Confirmed incident",
            dismissed: "Dismissed",
            needs_investigation: "Needs investigation",
          }}
          value={params.status}
        />
        <Filter
          name="camera"
          label="All cameras"
          options={data.cameras.map((camera) => camera.id)}
          optionLabels={Object.fromEntries(
            data.cameras.map((camera) => [camera.id, camera.name]),
          )}
          value={params.camera}
        />
        <label>
          <span className="sr-only">Start date</span>
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className="h-9 w-full rounded-lg border bg-white px-3 text-xs text-slate-600"
          />
        </label>
        <button className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white">
          Apply
        </button>
      </form>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {[
                  "Evidence",
                  "Incident",
                  "Camera",
                  "Date & time",
                  "Incident status",
                  "",
                ].map((column) => (
                  <th className="px-4 py-3 font-semibold" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((incident) => (
                <tr key={incident.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="relative grid h-14 w-22 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                      {incident.thumbnailUrl ? (
                        <Image
                          src={incident.thumbnailUrl}
                          alt="Incident evidence"
                          fill
                          sizes="88px"
                          className="object-cover"
                        />
                      ) : (
                        <ImageOff className="size-5" />
                      )}
                    </div>
                  </td>
                  <td className="max-w-sm px-4 py-3">
                    <p className="truncate font-semibold text-slate-700">
                      {incident.description}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      #{shortId(incident.id)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold text-slate-800 hover:text-teal-700"
                      href={`/operations?camera=${encodeURIComponent(incident.camera.id)}`}
                    >
                      {incident.camera.name}
                    </Link>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {incident.locationSource === "simulated"
                        ? "Simulated coordinates"
                        : "Verified coordinates"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(incident.occurredAt ?? incident.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ReviewStatusBadge value={incident.reviewStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      aria-label={`Open incident ${incident.id}`}
                      href={
                        "/incidents/" +
                        incident.id +
                        "?returnTo=" +
                        encodeURIComponent(returnTo)
                      }
                      className="inline-grid size-8 place-items-center rounded-lg hover:bg-slate-100"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.items.length && (
          <EmptyState
            title="No incidents found"
            description="No suspected incidents match the current filters."
          />
        )}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>
          {data.count} result{data.count === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <PageLink
            params={params}
            page={data.page - 1}
            disabled={data.page <= 1}
          >
            Previous
          </PageLink>
          <span className="bg-primary rounded-md px-3 py-1.5 text-white">
            {data.page} / {totalPages}
          </span>
          <PageLink
            params={params}
            page={data.page + 1}
            disabled={data.page >= totalPages}
          >
            Next
          </PageLink>
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
  optionLabels = {},
}: {
  name: string;
  label: string;
  options: string[];
  value: string | string[] | undefined;
  disabled?: boolean;
  optionLabels?: Record<string, string>;
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
          {optionLabels[option] ?? option.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled)
    return (
      <span className="rounded-md border bg-white px-3 py-1.5 opacity-40">
        {children}
      </span>
    );
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === "string" && key !== "page") query.set(key, value);
  query.set("page", String(page));
  return (
    <Link
      className="rounded-md border bg-white px-3 py-1.5 hover:bg-slate-50"
      href={`/incidents?${query}`}
    >
      {children}
    </Link>
  );
}

function stringValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function incidentsListUrl(
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const value = query.toString();
  return value ? "/incidents?" + value : "/incidents";
}
