export interface HafniaInvestigationDetails {
  sequenceOfEvents: string | null;
  peopleInvolved: string | null;
  vehiclesInvolved: string | null;
  objectsInvolved: string | null;
  visualEvidence: string | null;
  uncertainties: string | null;
}

const fields = {
  "sequence of events": "sequenceOfEvents",
  "people involved": "peopleInvolved",
  "vehicles involved": "vehiclesInvolved",
  "objects involved": "objectsInvolved",
  evidence: "visualEvidence",
  uncertainties: "uncertainties",
} as const;

const knownLabels = new Set([
  "dumping detected",
  "dumping type",
  "event timestamp",
  ...Object.keys(fields),
]);

type DetailKey = (typeof fields)[keyof typeof fields];

export function normalizeHafniaResponse(
  response: string | null,
): HafniaInvestigationDetails {
  response = response?.trim().replace(/^```json\s*|\s*```$/g, "") ?? null;
  const structured = parseJsonResponse(response);
  if (structured) return structured;

  const parsed: Partial<Record<DetailKey, string>> = {};
  let currentField: DetailKey | null = null;
  let sawKnownLabel = false;

  for (const line of response?.split(/\r?\n/) ?? []) {
    const match = line.match(/^\s*(?:\*\*)?([^:*]+?)(?:\*\*)?\s*:\s*(.*)$/);
    const label = match?.[1]?.trim().toLowerCase();
    const field = label ? fields[label as keyof typeof fields] : undefined;
    if (label && knownLabels.has(label)) sawKnownLabel = true;
    if (field) {
      currentField = field;
      parsed[field] = match?.[2]?.trim() ?? "";
      continue;
    }
    if (match) {
      currentField = null;
      continue;
    }
    if (currentField && line.trim()) {
      parsed[currentField] =
        `${parsed[currentField] ?? ""} ${line.trim()}`.trim();
    }
  }

  const normalized = {
    sequenceOfEvents: availableValue(parsed.sequenceOfEvents),
    peopleInvolved: availableValue(parsed.peopleInvolved),
    vehiclesInvolved: availableValue(parsed.vehiclesInvolved),
    objectsInvolved: availableValue(parsed.objectsInvolved),
    visualEvidence: availableValue(parsed.visualEvidence),
    uncertainties: availableValue(parsed.uncertainties),
  };
  if (!sawKnownLabel && response?.trim()) {
    normalized.sequenceOfEvents = response.trim();
  }
  return normalized;
}

function parseJsonResponse(
  response: string | null,
): HafniaInvestigationDetails | null {
  if (!response?.trim().startsWith("{")) return null;
  try {
    const value: unknown = JSON.parse(response);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const entries = Object.entries(value as Record<string, unknown>);
    const get = (...aliases: string[]) => {
      const aliasSet = new Set(aliases.map(normalizeKey));
      const match = entries.find(([key]) => aliasSet.has(normalizeKey(key)));
      return availableValue(narrativeText(match?.[1]));
    };
    return {
      sequenceOfEvents: get("sequence of events", "sequence", "description"),
      peopleInvolved: get("people involved", "people"),
      vehiclesInvolved: get("vehicles involved", "vehicles"),
      objectsInvolved: get("objects involved", "objects"),
      visualEvidence: get("evidence", "visual evidence"),
      uncertainties: get("uncertainties", "uncertainty", "limitations"),
    };
  } catch {
    return null;
  }
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function availableValue(value: string | null | undefined) {
  if (!value || /^(unknown|unavailable|not provided|n\/a)$/i.test(value)) {
    return null;
  }
  return value;
}

function narrativeText(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value.trim().slice(0, 8000) || null;
  if (depth >= 2 || !value || typeof value !== "object") return null;
  const entries = Array.isArray(value)
    ? value.slice(0, 12)
    : ["description", "actions", "state", "evidence", "limitations"].map(
        (key) => (value as Record<string, unknown>)[key],
      );
  return (
    entries
      .map((item) => narrativeText(item, depth + 1))
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000) || null
  );
}
