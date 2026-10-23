import { authenticatedClient } from "../../_lib/data";
import { isOverdue } from "../../_lib/overdue";
import type { IncidentClassification, ReviewStatus } from "../../_lib/types";
import { getIncident } from "../../incidents/[id]/_queries/incident";
import type {
  CaseEventType,
  CaseNextAction,
  CaseStatus,
  SiteCheckResult,
} from "../_lib/case-state";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASE_COLUMNS =
  "id,incident_id,status,next_action,owner_id,resolution_notes,opened_at,assigned_at,started_at,resolved_at";

interface CaseRow {
  id: string;
  incident_id: string;
  status: CaseStatus;
  next_action: CaseNextAction | null;
  owner_id: string | null;
  resolution_notes: string | null;
  opened_at: string;
  assigned_at: string | null;
  started_at: string | null;
  resolved_at: string | null;
}

interface CaseListRow extends CaseRow {
  incident: {
    classification: IncidentClassification;
    review_status: ReviewStatus;
    description: string;
    occurred_at: string | null;
    created_at: string;
    detection: { camera: { id: string; name: string } };
  };
}

interface Assignee {
  id: string;
  email: string;
  role: string;
}

interface CaseListItem {
  id: string;
  incidentId: string;
  status: CaseStatus;
  nextAction: CaseNextAction | null;
  ownerLabel: string | null;
  openedAt: string;
  recordedAt: string;
  classification: IncidentClassification;
  description: string;
  cameraName: string;
  overdue: boolean;
  siteCheck: { result: SiteCheckResult; completedAt: string } | null;
}

export type CaseFilter = CaseStatus | "overdue" | "all";

export interface CaseListResult {
  available: boolean;
  items: CaseListItem[];
  counts: Record<CaseFilter, number>;
  filter: CaseFilter;
}

function isMissingWorkflow(error: { code?: string }) {
  return (
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    error.code === "42P01" ||
    error.code === "42883"
  );
}

function parseFilter(value: string | undefined): CaseFilter {
  return value === "open" ||
    value === "assigned" ||
    value === "in_progress" ||
    value === "resolved" ||
    value === "overdue"
    ? value
    : "all";
}

async function getAssignees(
  supabase: Awaited<ReturnType<typeof authenticatedClient>>["supabase"],
): Promise<Assignee[]> {
  const { data, error } = await supabase.rpc("list_case_assignees");
  if (error) {
    if (isMissingWorkflow(error)) return [];
    throw new Error(`Unable to load case owners: ${error.message}`);
  }
  return (data ?? []) as Assignee[];
}

async function getLatestSiteChecks(
  supabase: Awaited<ReturnType<typeof authenticatedClient>>["supabase"],
  caseIds: string[],
) {
  const latest = new Map<
    string,
    { result: SiteCheckResult; completedAt: string }
  >();
  if (!caseIds.length) return latest;
  const { data, error } = await supabase
    .from("case_site_checks")
    .select("case_id,result,completed_at")
    .in("case_id", caseIds)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (error) {
    if (isMissingWorkflow(error)) return latest;
    throw new Error(`Unable to load site checks: ${error.message}`);
  }
  for (const row of data ?? []) {
    if (!latest.has(row.case_id)) {
      latest.set(row.case_id, {
        result: row.result as SiteCheckResult,
        completedAt: row.completed_at as string,
      });
    }
  }
  return latest;
}

export async function getCases(
  requestedFilter?: string,
): Promise<CaseListResult> {
  const { supabase } = await authenticatedClient();
  const filter = parseFilter(requestedFilter);
  const { data, error } = await supabase
    .from("cases")
    .select(
      `${CASE_COLUMNS},incident:incidents!cases_incident_fk!inner(classification,review_status,description,occurred_at,created_at,detection:detections!incidents_detection_fk!inner(camera:cameras!detections_camera_fk!inner(id,name)))`,
    )
    .order("opened_at", { ascending: true })
    .limit(200);
  if (error) {
    if (isMissingWorkflow(error)) {
      return {
        available: false,
        items: [],
        counts: {
          all: 0,
          open: 0,
          assigned: 0,
          in_progress: 0,
          resolved: 0,
          overdue: 0,
        },
        filter,
      };
    }
    throw new Error(`Unable to load cases: ${error.message}`);
  }
  const assignees = await getAssignees(supabase);
  const latestChecks = await getLatestSiteChecks(
    supabase,
    ((data ?? []) as unknown as CaseListRow[]).map((row) => row.id),
  );
  const ownerLabels = new Map(assignees.map((item) => [item.id, item.email]));
  const now = Date.now();
  const items = ((data ?? []) as unknown as CaseListRow[]).map(
    (row): CaseListItem => {
      const recordedAt = row.incident.occurred_at ?? row.incident.created_at;
      return {
        id: row.id,
        incidentId: row.incident_id,
        status: row.status,
        nextAction: row.next_action,
        ownerLabel: row.owner_id
          ? (ownerLabels.get(row.owner_id) ??
            `Operator ${row.owner_id.slice(0, 8)}`)
          : null,
        openedAt: row.opened_at,
        recordedAt,
        classification: row.incident.classification,
        description: row.incident.description,
        cameraName: row.incident.detection.camera.name,
        siteCheck: latestChecks.get(row.id) ?? null,
        overdue: isOverdue(
          {
            recordedAt,
            reviewStatus: row.incident.review_status,
            caseStatus: row.status,
          },
          now,
        ),
      };
    },
  );
  const counts = {
    all: items.length,
    open: items.filter((item) => item.status === "open").length,
    assigned: items.filter((item) => item.status === "assigned").length,
    in_progress: items.filter((item) => item.status === "in_progress").length,
    resolved: items.filter((item) => item.status === "resolved").length,
    overdue: items.filter((item) => item.overdue).length,
  };
  const visible = items.filter((item) =>
    filter === "all"
      ? true
      : filter === "overdue"
        ? item.overdue
        : item.status === filter,
  );
  return { available: true, items: visible, counts, filter };
}

export async function getCaseSummaryForIncident(incidentId: string) {
  if (!UUID.test(incidentId)) return null;
  const { supabase } = await authenticatedClient();
  const { data, error } = await supabase
    .from("cases")
    .select("id,status")
    .eq("incident_id", incidentId)
    .maybeSingle();
  if (error) {
    if (isMissingWorkflow(error)) return null;
    throw new Error(`Unable to load the incident case: ${error.message}`);
  }
  return data
    ? { id: data.id as string, status: data.status as CaseStatus }
    : null;
}

interface CaseEvent {
  id: string;
  type: CaseEventType;
  actorLabel: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
  details: Record<string, unknown>;
  createdAt: string;
}

interface SiteCheck {
  id: string;
  status: "processing" | "completed" | "failed";
  result: SiteCheckResult | null;
  windowStartAt: string;
  windowEndAt: string;
  summary: string | null;
  uncertainty: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CaseDetail {
  id: string;
  status: CaseStatus;
  nextAction: CaseNextAction | null;
  ownerId: string | null;
  ownerLabel: string | null;
  resolutionNotes: string | null;
  openedAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  recordedAt: string;
  overdue: boolean;
  incident: NonNullable<Awaited<ReturnType<typeof getIncident>>>;
  events: CaseEvent[];
  siteChecks: SiteCheck[];
  assignees: Assignee[];
}

export async function getCase(id: string): Promise<CaseDetail | null> {
  if (!UUID.test(id)) return null;
  const { supabase, user } = await authenticatedClient();
  const { data, error } = await supabase
    .from("cases")
    .select(CASE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingWorkflow(error)) return null;
    throw new Error(`Unable to load case: ${error.message}`);
  }
  if (!data) return null;
  const row = data as CaseRow;
  const [incident, eventsResult, siteChecksResult, assignees] =
    await Promise.all([
      getIncident(row.incident_id),
      supabase
        .from("case_events")
        .select(
          "id,actor_id,event_type,from_status,to_status,details,created_at",
        )
        .eq("case_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("case_site_checks")
        .select(
          "id,status,result,window_start_at,window_end_at,summary,uncertainty,created_at,completed_at",
        )
        .eq("case_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      getAssignees(supabase),
    ]);
  if (!incident) return null;
  if (eventsResult.error) {
    throw new Error(
      `Unable to load case history: ${eventsResult.error.message}`,
    );
  }
  if (siteChecksResult.error && !isMissingWorkflow(siteChecksResult.error)) {
    throw new Error(
      `Unable to load site checks: ${siteChecksResult.error.message}`,
    );
  }
  const labelFor = (actorId: string | null) => {
    if (!actorId) return "System";
    if (actorId === user.id) return user.email ?? "You";
    return (
      assignees.find((item) => item.id === actorId)?.email ??
      `Operator ${actorId.slice(0, 8)}`
    );
  };
  const recordedAt = incident.occurredAt ?? incident.createdAt;
  return {
    id: row.id,
    status: row.status,
    nextAction: row.next_action,
    ownerId: row.owner_id,
    ownerLabel: row.owner_id ? labelFor(row.owner_id) : null,
    resolutionNotes: row.resolution_notes,
    openedAt: row.opened_at,
    assignedAt: row.assigned_at,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    recordedAt,
    overdue: isOverdue(
      {
        recordedAt,
        reviewStatus: incident.reviewStatus,
        caseStatus: row.status,
      },
      Date.now(),
    ),
    incident,
    assignees,
    siteChecks: (siteChecksResult.data ?? []).map((check) => ({
      id: check.id as string,
      status: check.status as SiteCheck["status"],
      result: check.result as SiteCheckResult | null,
      windowStartAt: check.window_start_at as string,
      windowEndAt: check.window_end_at as string,
      summary: check.summary as string | null,
      uncertainty: check.uncertainty as string | null,
      createdAt: check.created_at as string,
      completedAt: check.completed_at as string | null,
    })),
    events: (eventsResult.data ?? []).map((event) => ({
      id: event.id as string,
      type: event.event_type as CaseEventType,
      actorLabel: labelFor(event.actor_id as string | null),
      fromStatus: event.from_status as CaseStatus | null,
      toStatus: event.to_status as CaseStatus | null,
      details: (event.details ?? {}) as Record<string, unknown>,
      createdAt: event.created_at as string,
    })),
  };
}
