"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  StickyNote,
  UsersRound,
  X,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "../../_lib/format";
import { mutateCleanupCaseAction } from "../_actions/cleanup";
import {
  buildVisibleCleanupActivity,
  cleanupKpis,
  cleanupOutcomeLabel,
  calculateCleanupDueAt,
  filterCleanupCases,
  isCleanupOverdue,
  selectableCleanupTeams,
  sortCleanupCases,
} from "../_lib/cleanup-data";
import type {
  CleanupCase,
  CleanupStatus,
  CleanupWorkspaceData,
  ResolutionOutcome,
} from "../_lib/types";
import { CleanupStatusBadge } from "./cleanup-status";

type StatusFilter = "all" | CleanupStatus;
type CleanupAction =
  | "assign_cleanup"
  | "add_note"
  | "mark_cleaned"
  | "reopen"
  | "resolve"
  | "manual_recheck"
  | "acknowledge_notification";

export function CleanupWorkspace({
  data,
  initialCaseId,
}: {
  data: CleanupWorkspaceData;
  initialCaseId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    data.cases.some((item) => item.id === initialCaseId) ? initialCaseId : null,
  );
  const filtered = useMemo(
    () =>
      sortCleanupCases(
        filterCleanupCases(data.cases, { query, status }),
        data.referenceTime,
      ),
    [data.cases, data.referenceTime, query, status],
  );
  const selected = data.cases.find((item) => item.id === selectedId) ?? null;
  const kpis = cleanupKpis(data.cases, data.referenceTime);

  return (
    <div className="mx-auto max-w-[1700px]">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          Cleanup
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage waste removal and site verification
        </p>
      </header>

      <section
        aria-label="Cleanup summary"
        className="mt-5 grid gap-3 sm:grid-cols-3"
      >
        <Kpi
          label="Awaiting Cleanup"
          value={kpis.awaiting}
          icon={ClipboardList}
          tone="amber"
        />
        <Kpi
          label="In Progress"
          value={kpis.inProgress}
          icon={Clock3}
          tone="sky"
        />
        <Kpi
          label="Pending Verification"
          value={kpis.verification}
          icon={ShieldCheck}
          tone="teal"
          hint={
            kpis.overdue
              ? `${kpis.overdue} overdue active case${kpis.overdue === 1 ? "" : "s"}`
              : undefined
          }
        />
      </section>

      <section className="surface mt-4 p-3" aria-label="Cleanup filters">
        <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_220px]">
          <label className="relative">
            <span className="sr-only">Search cleanup cases</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search case, team, or location"
              className="h-9 w-full rounded-lg border bg-slate-50 pr-3 pl-9 text-xs"
            />
          </label>
          <label>
            <span className="sr-only">Cleanup status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as StatusFilter)
              }
              className="h-9 w-full rounded-lg border bg-white px-3 text-xs text-slate-600"
            >
              <option value="all">All statuses</option>
              <option value="awaiting_cleanup">Awaiting Cleanup</option>
              <option value="in_progress">In Progress</option>
              <option value="verification">Pending Verification</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>
      </section>

      <section
        className="surface mt-4 overflow-hidden"
        aria-label="Cleanup cases"
      >
        {!data.cases.length ? (
          <Empty
            title="No cleanup cases"
            description="Cases appear automatically when an investigator confirms an incident."
          />
        ) : !filtered.length ? (
          <Empty
            title="No matching cases"
            description="Adjust the search or status filter to see cleanup work."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-slate-50 text-[10px] tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Case / Location</th>
                    <th className="px-4 py-3">Assigned Team</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((item) => {
                    const overdue = isCleanupOverdue(item, data.referenceTime);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">
                          <strong className="block text-slate-800">
                            CL-{item.id.slice(0, 8).toUpperCase()}
                          </strong>
                          <span className="mt-0.5 block text-slate-500">
                            {item.incident.cameraName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item.assignedTeamName ?? "Unassigned"}
                        </td>
                        <td className="px-4 py-3">
                          <CleanupStatusBadge status={item.status} />
                          {item.reconciliationRequired && (
                            <Badge tone="danger" className="ml-1">
                              Reconcile
                            </Badge>
                          )}
                          {item.notifications.some(
                            (notification) => !notification.acknowledgedAt,
                          ) && (
                            <Badge tone="danger" className="ml-1">
                              Attention Required
                            </Badge>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3",
                            overdue && "font-semibold text-red-700",
                          )}
                        >
                          {item.dueAt ? formatDateTime(item.dueAt) : "Not set"}
                          {overdue && (
                            <span className="block text-[10px]">Overdue</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="block w-full p-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">
                      CL-{item.id.slice(0, 8).toUpperCase()}
                    </strong>
                    <CleanupStatusBadge status={item.status} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {item.incident.cameraName} ·{" "}
                    {item.assignedTeamName ?? "Unassigned"}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {selected && (
        <CaseDrawer
          key={`${selected.id}:${selected.updatedAt}`}
          cleanupCase={selected}
          teams={data.teams}
          referenceTime={data.referenceTime}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function CaseDrawer({
  cleanupCase,
  teams,
  referenceTime,
  onClose,
}: {
  cleanupCase: CleanupCase;
  teams: CleanupWorkspaceData["teams"];
  referenceTime: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const mutation = useAction(mutateCleanupCaseAction);
  const [teamId, setTeamId] = useState(cleanupCase.assignedTeamId ?? "");
  const [slaHours, setSlaHours] = useState<24 | 48 | 72>(
    cleanupCase.slaHours ?? 48,
  );
  const [instructions, setInstructions] = useState(
    cleanupCase.instructions ?? "",
  );
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [assignmentEditing, setAssignmentEditing] = useState(
    cleanupCase.status === "awaiting_cleanup",
  );
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [outcome, setOutcome] =
    useState<ResolutionOutcome>("cleanup_completed");
  const [error, setError] = useState<string | null>(null);
  const resolved = cleanupCase.status === "resolved";
  const activeTeams = selectableCleanupTeams(teams, cleanupCase.assignedTeamId);
  const assignmentDirty =
    teamId !== (cleanupCase.assignedTeamId ?? "") ||
    slaHours !== (cleanupCase.slaHours ?? 48) ||
    instructions !== (cleanupCase.instructions ?? "");
  const duePreview = calculateCleanupDueAt(
    cleanupCase.assignedAt ?? referenceTime,
    slaHours,
  );
  const visibleActivity = buildVisibleCleanupActivity(cleanupCase.history);
  const displayedActivity = historyExpanded
    ? visibleActivity
    : visibleActivity.slice(0, 4);

  async function execute(action: CleanupAction, notificationId?: string) {
    setError(null);
    const result = await mutation.executeAsync({
      caseId: cleanupCase.id,
      expectedUpdatedAt: cleanupCase.updatedAt,
      action,
      ...(notificationId ? { notificationId } : {}),
      ...(action === "assign_cleanup"
        ? { teamId, slaHours, instructions }
        : {}),
      ...(["add_note", "reopen", "resolve"].includes(action) ? { notes } : {}),
      ...(action === "resolve" ? { resolutionOutcome: outcome } : {}),
    });
    if (result?.data?.success) {
      setNotes("");
      setNoteOpen(false);
      setReopenOpen(false);
      setAssignmentEditing(false);
      router.refresh();
    } else {
      setError(
        result?.data?.error ??
          result?.serverError ??
          "Check the supplied values and try again.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"
      role="dialog"
      aria-modal="true"
      aria-label={`Cleanup case ${cleanupCase.id}`}
    >
      <aside className="h-full w-full overflow-y-auto bg-white shadow-2xl sm:max-w-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg font-bold">
                CL-{cleanupCase.id.slice(0, 8).toUpperCase()}
              </h2>
              <CleanupStatusBadge status={cleanupCase.status} />
              {isCleanupOverdue(cleanupCase, referenceTime) && (
                <Badge tone="danger">Overdue</Badge>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Updated {formatDateTime(cleanupCase.updatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"
            aria-label="Close cleanup case"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="px-5 pb-6">
          {cleanupCase.reconciliationRequired && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-800">
              <AlertTriangle className="mr-2 inline size-4" />
              The incident was reclassified and needs authorized reconciliation.
            </div>
          )}

          <DrawerSection title="Incident Context">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
              <span>{cleanupCase.incident.cameraName}</span>
              <span className="font-normal text-slate-400">·</span>
              <span className="font-normal text-slate-500">
                {formatDateTime(
                  cleanupCase.incident.occurredAt ??
                    cleanupCase.incident.createdAt,
                )}
              </span>
              {cleanupCase.incident.locationSource === "simulated" && (
                <Badge tone="warning">Simulated</Badge>
              )}
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
              {cleanupCase.incident.description}
            </p>
            <Link
              href={`/incidents/${cleanupCase.incidentId}?tab=evidence`}
              className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:text-teal-900"
            >
              View original incident and evidence
            </Link>
          </DrawerSection>

          <DrawerSection
            title={resolved ? "Cleanup Details" : "Cleanup Assignment"}
          >
            {!teams.length && cleanupCase.status === "awaiting_cleanup" ? (
              <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                No cleanup teams are configured. Add an active team in the
                database before assigning this case.
              </div>
            ) : assignmentEditing ? (
              <>
                <fieldset
                  disabled={mutation.isPending}
                  className="grid gap-3 disabled:opacity-70 sm:grid-cols-2"
                >
                  <label className="text-xs font-semibold text-slate-600">
                    Cleanup Team
                    <select
                      value={teamId}
                      onChange={(event) => setTeamId(event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border bg-white px-3 font-normal"
                    >
                      <option value="">Choose a team</option>
                      {activeTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                          {team.active ? "" : " (inactive)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Resolution Time
                    <select
                      value={slaHours}
                      onChange={(event) =>
                        setSlaHours(Number(event.target.value) as 24 | 48 | 72)
                      }
                      className="mt-1 h-9 w-full rounded-lg border bg-white px-3 font-normal"
                    >
                      <option value={24}>24 hours</option>
                      <option value={48}>48 hours</option>
                      <option value={72}>72 hours</option>
                    </select>
                  </label>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-slate-600">
                      Due Date
                    </p>
                    <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {duePreview
                        ? formatDateTime(duePreview)
                        : cleanupCase.dueAt
                          ? formatDateTime(cleanupCase.dueAt)
                          : `Calculated when assigned · ${slaHours} hours`}
                    </p>
                  </div>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    Instructions{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                    <textarea
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                      maxLength={4000}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-lg border p-3 font-normal"
                      placeholder="Access details or cleanup requirements"
                    />
                  </label>
                </fieldset>
                <div className="mt-3 flex items-center gap-3">
                  <PrimaryButton
                    onClick={() => execute("assign_cleanup")}
                    disabled={
                      mutation.isPending ||
                      !teamId ||
                      (Boolean(cleanupCase.assignedTeamId) && !assignmentDirty)
                    }
                  >
                    {cleanupCase.assignedTeamId
                      ? "Save Changes"
                      : "Assign Cleanup"}
                  </PrimaryButton>
                  {cleanupCase.status !== "awaiting_cleanup" && (
                    <button
                      type="button"
                      onClick={() => {
                        setTeamId(cleanupCase.assignedTeamId ?? "");
                        setSlaHours(cleanupCase.slaHours ?? 48);
                        setInstructions(cleanupCase.instructions ?? "");
                        setAssignmentEditing(false);
                      }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </>
            ) : (
              <AssignmentSummary cleanupCase={cleanupCase}>
                {cleanupCase.status === "in_progress" && (
                  <button
                    type="button"
                    onClick={() => setAssignmentEditing(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    <Pencil className="size-3" /> Edit assignment
                  </button>
                )}
              </AssignmentSummary>
            )}
          </DrawerSection>

          <DrawerSection title="Scene Check">
            <SceneCheckPanel
              cleanupCase={cleanupCase}
              pending={mutation.isPending}
              onRecheck={() => execute("manual_recheck")}
              onAcknowledge={(id) => execute("acknowledge_notification", id)}
            />
          </DrawerSection>

          <DrawerSection title="Activity & Actions">
            {resolved && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-emerald-800">
                  <CheckCircle2 className="size-4" />
                  Cleanup verified
                </div>
                <dl className="mt-3 grid grid-cols-[88px_1fr] gap-y-2 leading-5 text-emerald-950">
                  <dt className="text-emerald-700">Result</dt>
                  <dd>{cleanupOutcomeLabel(cleanupCase.resolutionOutcome)}</dd>
                  <dt className="text-emerald-700">Method</dt>
                  <dd>
                    {cleanupCase.resolutionSource === "ai"
                      ? "Validated AI scene check"
                      : "Human review"}
                  </dd>
                  <dt className="text-emerald-700">Verified by</dt>
                  <dd>
                    {cleanupCase.resolverLabel ?? "Authorized coordinator"}
                  </dd>
                  <dt className="text-emerald-700">Verified at</dt>
                  <dd>
                    {cleanupCase.resolvedAt
                      ? formatDateTime(cleanupCase.resolvedAt)
                      : "Not recorded"}
                  </dd>
                  <dt className="text-emerald-700">Notes</dt>
                  <dd>{cleanupCase.resolutionNotes ?? "No notes supplied"}</dd>
                </dl>
                <VerificationEvidence incidentId={cleanupCase.incidentId} />
              </div>
            )}

            {cleanupCase.status === "awaiting_cleanup" && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Choose a cleanup team and resolution time to begin work.
              </p>
            )}
            {cleanupCase.status === "in_progress" && (
              <PrimaryButton
                onClick={() => execute("mark_cleaned")}
                disabled={mutation.isPending || !cleanupCase.assignedTeamId}
                className="mb-4 w-full"
              >
                Mark Site Cleaned
              </PrimaryButton>
            )}
            {cleanupCase.status === "verification" && (
              <div className="mb-4 space-y-3 rounded-lg bg-teal-50 p-3">
                <div className="text-xs leading-5 text-slate-600">
                  <p className="font-semibold text-slate-800">
                    Human review required
                  </p>
                  <p>
                    Confirm the site condition from the available evidence. No
                    automated verification is performed.
                  </p>
                </div>
                <VerificationEvidence incidentId={cleanupCase.incidentId} />
                <label className="block text-xs font-semibold text-slate-700">
                  Verification result
                  <select
                    value={outcome}
                    onChange={(event) =>
                      setOutcome(event.target.value as ResolutionOutcome)
                    }
                    className="mt-1 h-9 w-full rounded-lg border bg-white px-3 font-normal"
                  >
                    <option value="cleanup_completed">Cleanup Completed</option>
                    <option value="site_already_cleared">
                      Site Already Cleared
                    </option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Human verification notes
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={4000}
                    rows={2}
                    className="mt-1 w-full rounded-lg border bg-white p-3 font-normal"
                    placeholder="What was verified?"
                  />
                </label>
                <PrimaryButton
                  onClick={() => execute("resolve")}
                  disabled={mutation.isPending || !notes.trim()}
                  className="w-full"
                >
                  Verify & Resolve
                </PrimaryButton>
                {!reopenOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNotes("");
                      setReopenOpen(true);
                    }}
                    className="w-full text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Waste remains — reopen cleanup
                  </button>
                ) : (
                  <div className="border-t border-teal-200 pt-3">
                    <p className="text-xs text-slate-600">
                      Enter the reason above, then return the case to the team.
                    </p>
                    <button
                      type="button"
                      onClick={() => execute("reopen")}
                      disabled={mutation.isPending || !notes.trim()}
                      className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      Reopen Case
                    </button>
                  </div>
                )}
              </div>
            )}

            {!resolved && cleanupCase.status !== "verification" && (
              <div className="mb-4">
                {!noteOpen ? (
                  <button
                    type="button"
                    onClick={() => setNoteOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    <StickyNote className="size-3.5" /> Add Note
                  </button>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={4000}
                      rows={2}
                      className="w-full rounded-lg border bg-white p-3 text-xs"
                      placeholder="Add an operational note"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => execute("add_note")}
                        disabled={mutation.isPending || !notes.trim()}
                        className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Save Note
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNotes("");
                          setNoteOpen(false);
                        }}
                        className="px-2 text-xs text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700"
              >
                {error}
              </p>
            )}

            {visibleActivity.length ? (
              <ol className="space-y-3">
                {displayedActivity.map((event) => (
                  <li key={event.id} className="relative pl-5 text-xs">
                    <span className="absolute top-1 left-0 size-2 rounded-full bg-teal-500" />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <strong className="text-slate-700">{event.label}</strong>
                      <time className="text-[10px] text-slate-400">
                        {formatActivityDate(event.createdAt)}
                      </time>
                    </div>
                    {event.detail && (
                      <p className="mt-1 leading-5 text-slate-600">
                        {event.detail}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {event.actorLabel}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-500">No activity recorded.</p>
            )}
            {visibleActivity.length > 4 && (
              <button
                type="button"
                onClick={() => setHistoryExpanded((value) => !value)}
                className="mt-4 text-xs font-semibold text-teal-700 hover:text-teal-900"
              >
                {historyExpanded ? "Show recent activity" : "View all activity"}
              </button>
            )}
          </DrawerSection>
        </div>
      </aside>
    </div>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b py-5 last:border-b-0">
      <h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function SceneCheckPanel({
  cleanupCase,
  pending,
  onRecheck,
  onAcknowledge,
}: {
  cleanupCase: CleanupCase;
  pending: boolean;
  onRecheck: () => void;
  onAcknowledge: (id: string) => void;
}) {
  const latest = cleanupCase.sceneChecks[0] ?? null;
  const next = cleanupCase.sceneChecks.find(
    (check) => check.status === "scheduled",
  );
  const attention = cleanupCase.notifications.filter(
    (notification) => !notification.acknowledgedAt,
  );
  return (
    <div className="space-y-3 text-xs">
      {attention.map((notification) => (
        <div
          key={notification.id}
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900"
        >
          <p className="flex items-center gap-2 font-semibold">
            <BellRing className="size-4" /> {notification.title}
          </p>
          <p className="mt-1 leading-5">{notification.message}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAcknowledge(notification.id)}
            className="mt-2 font-semibold text-red-700 hover:text-red-950 disabled:opacity-50"
          >
            Acknowledge
          </button>
        </div>
      ))}

      <dl className="grid grid-cols-[110px_1fr] gap-y-2 rounded-lg bg-slate-50 p-3 leading-5">
        <dt className="text-slate-500">Next check</dt>
        <dd>{next ? formatDateTime(next.scheduledFor) : "None scheduled"}</dd>
        <dt className="text-slate-500">Current status</dt>
        <dd className="font-semibold capitalize">
          {latest?.status.replace("_", " ") ?? "Not scheduled"}
          {latest?.cancellationRequested ? " · cancellation requested" : ""}
        </dd>
        <dt className="text-slate-500">Assessment</dt>
        <dd className="capitalize">
          {latest?.assessment?.replace("_", " ") ?? "Not available"}
        </dd>
        <dt className="text-slate-500">Captured</dt>
        <dd>
          {latest?.capturedAt
            ? formatDateTime(latest.capturedAt)
            : "Not captured"}
        </dd>
        <dt className="text-slate-500">Analyzed</dt>
        <dd>
          {latest?.analyzedAt
            ? formatDateTime(latest.analyzedAt)
            : "Not analyzed"}
        </dd>
      </dl>

      {(cleanupCase.incident.originalEvidenceUrl || latest?.snapshotUrl) && (
        <div className="grid grid-cols-2 gap-2">
          <EvidenceImage
            label="Original post-dumping evidence"
            url={cleanupCase.incident.originalEvidenceUrl}
          />
          <EvidenceImage
            label="Latest follow-up"
            url={latest?.snapshotUrl ?? null}
          />
        </div>
      )}

      {!!latest?.groundedObservations.length && (
        <div>
          <p className="font-semibold text-slate-700">Grounded observations</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600">
            {latest.groundedObservations.map((observation) => (
              <li key={observation}>{observation}</li>
            ))}
          </ul>
        </div>
      )}
      {!!latest?.limitations.length && (
        <p className="rounded-lg bg-amber-50 p-3 leading-5 text-amber-900">
          {latest.limitations.join(" ")}
        </p>
      )}
      {latest?.errorMessage && (
        <p className="rounded-lg bg-red-50 p-3 text-red-800">
          {latest.errorMessage}
        </p>
      )}

      {!cleanupCase.sceneChecks.length ? (
        <p className="text-slate-500">
          A check will be scheduled when a cleanup deadline is assigned.
        </p>
      ) : (
        <details>
          <summary className="cursor-pointer font-semibold text-teal-700">
            Check history ({cleanupCase.sceneChecks.length})
          </summary>
          <ol className="mt-2 space-y-2 border-l pl-3 text-slate-600">
            {cleanupCase.sceneChecks.map((check) => (
              <li key={check.id}>
                <span className="font-semibold text-slate-800 capitalize">
                  {check.status}
                </span>{" "}
                · {formatDateTime(check.scheduledFor)} · {check.triggerKind}
              </li>
            ))}
          </ol>
        </details>
      )}

      {!cleanupCase.resolvedAt && (
        <button
          type="button"
          disabled={pending}
          onClick={onRecheck}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 py-2 font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" /> Manual Recheck
        </button>
      )}
    </div>
  );
}

function EvidenceImage({ label, url }: { label: string; url: string | null }) {
  return (
    <figure>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100">
        {url ? (
          <Image
            src={url}
            alt={label}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="grid h-full place-items-center p-2 text-center text-[10px] text-slate-400">
            Not available
          </span>
        )}
      </div>
      <figcaption className="mt-1 text-[10px] text-slate-500">
        {label}
      </figcaption>
    </figure>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  tone: "amber" | "sky" | "teal";
  hint?: string;
}) {
  const colors = {
    amber: "bg-amber-400 text-slate-900",
    sky: "bg-sky-500 text-white",
    teal: "bg-teal-500 text-white",
  };
  return (
    <Card className="flex items-center gap-3 p-4">
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
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {hint && (
          <p className="text-[10px] font-semibold text-red-600">{hint}</p>
        )}
      </div>
    </Card>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-64 place-items-center p-8 text-center">
      <div>
        <UsersRound className="mx-auto size-7 text-slate-400" />
        <h2 className="mt-3 text-sm font-bold">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function AssignmentSummary({
  cleanupCase,
  children,
}: {
  cleanupCase: CleanupCase;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-xs">
      <dl className="grid grid-cols-[92px_1fr] gap-y-2 leading-5">
        <dt className="text-slate-500">Team</dt>
        <dd className="font-semibold text-slate-800">
          {cleanupCase.assignedTeamName ?? "Unassigned"}
        </dd>
        <dt className="text-slate-500">Due</dt>
        <dd>
          {cleanupCase.dueAt ? formatDateTime(cleanupCase.dueAt) : "Not set"}
        </dd>
        <dt className="text-slate-500">Resolution time</dt>
        <dd>
          {cleanupCase.slaHours ? `${cleanupCase.slaHours} hours` : "Not set"}
        </dd>
        <dt className="text-slate-500">Instructions</dt>
        <dd className="whitespace-pre-wrap">
          {cleanupCase.instructions || "No instructions supplied"}
        </dd>
      </dl>
      {children && <div className="mt-3 border-t pt-3">{children}</div>}
    </div>
  );
}

function VerificationEvidence({ incidentId }: { incidentId: string }) {
  return (
    <div className="mt-3 border-t border-current/10 pt-3 text-xs leading-5">
      <p>
        <span className="text-slate-500">Original evidence:</span>{" "}
        <Link
          href={`/incidents/${incidentId}?tab=evidence`}
          className="font-semibold text-teal-700 hover:text-teal-900"
        >
          View incident evidence
        </Link>
      </p>
      <p>
        <span className="text-slate-500">Cleanup evidence:</span> No cleanup
        photo supplied
      </p>
    </div>
  );
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
