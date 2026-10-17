const incidentTabIds = ["overview", "analysis", "history"] as const;

export type IncidentTabId = (typeof incidentTabIds)[number];

export function normalizeIncidentTab(value: string | null): IncidentTabId {
  return incidentTabIds.includes(value as IncidentTabId)
    ? (value as IncidentTabId)
    : "overview";
}

export function incidentWorkspaceHref(
  pathname: string,
  currentQuery: string,
  tab: IncidentTabId,
  frame?: string | null,
) {
  const next = new URLSearchParams(currentQuery);
  next.set("tab", tab);
  next.delete("frame");
  if (tab === "overview" && frame) next.set("seek", frame);
  else next.delete("seek");
  return pathname + "?" + next.toString();
}

export function safeIncidentListReturn(value: string | undefined) {
  return value === "/incidents" || value?.startsWith("/incidents?")
    ? value
    : "/incidents";
}
