import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "../_components/page-elements";
import { formatDateTime } from "../_lib/format";
import { OVERDUE_AFTER_HOURS, currentTime } from "../_lib/overdue";
import { CaseStatusBadge, OverdueBadge } from "./_components/case-badges";
import { SiteCheckBadge } from "./_components/site-check-panel";
import { nextActionLabel } from "./_lib/case-state";
import { getCases, type CaseFilter } from "./_queries/cases";

export const metadata: Metadata = { title: "Cases" };

const tabs: Array<{ filter: CaseFilter; label: string }> = [
  { filter: "all", label: "All" },
  { filter: "open", label: "Open" },
  { filter: "assigned", label: "Assigned" },
  { filter: "in_progress", label: "In progress" },
  { filter: "resolved", label: "Resolved" },
  { filter: "overdue", label: "Overdue" },
];

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await getCases(
    typeof params.status === "string" ? params.status : undefined,
  );
  const now = currentTime();
  return (
    <>
      <PageHeader
        title="Cases"
        description="Human-confirmed incidents being followed through to resolution."
      />
      {!result.available ? (
        <div className="surface">
          <EmptyState
            icon={FolderKanban}
            title="The case workflow is not set up yet"
            description="Apply database migration 20261021100000_create_case_workflow.sql to your Supabase project, then reload this page."
          />
        </div>
      ) : (
        <>
          {result.counts.overdue > 0 && (
            <Link
              href="/cases?status=overdue"
              className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
            >
              <TriangleAlert className="size-4" />
              {result.counts.overdue} case
              {result.counts.overdue === 1 ? " has" : "s have"} not been acted
              on for more than {OVERDUE_AFTER_HOURS} hours since the recording.
            </Link>
          )}
          <nav
            aria-label="Case status filter"
            className="mb-4 flex flex-wrap gap-2"
          >
            {tabs.map((tab) => (
              <Link
                key={tab.filter}
                href={
                  tab.filter === "all"
                    ? "/cases"
                    : `/cases?status=${tab.filter}`
                }
                aria-current={result.filter === tab.filter ? "page" : undefined}
                className={
                  result.filter === tab.filter
                    ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }
              >
                {tab.label} ({result.counts[tab.filter]})
              </Link>
            ))}
          </nav>
          <div className="surface">
            {result.items.length ? (
              <div className="divide-y">
                {result.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/cases/${item.id}`}
                    className="grid items-center gap-3 p-4 hover:bg-slate-50 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CaseStatusBadge value={item.status} />
                        {item.overdue && (
                          <OverdueBadge
                            recordedAt={item.recordedAt}
                            now={now}
                          />
                        )}
                        {item.siteCheck && item.status !== "resolved" && (
                          <SiteCheckBadge result={item.siteCheck.result} />
                        )}
                        <span className="text-xs font-semibold text-slate-800">
                          Case {item.id.slice(0, 8)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {item.cameraName} · recorded{" "}
                        {formatDateTime(item.recordedAt)} UTC
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                        {item.description}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 sm:text-right">
                      <p>{item.ownerLabel ?? "Unassigned"}</p>
                      <p className="mt-1">
                        {item.nextAction
                          ? nextActionLabel(item.nextAction)
                          : "No next action"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FolderKanban}
                title="No cases here"
                description="A case is opened automatically when an operator confirms an incident."
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
