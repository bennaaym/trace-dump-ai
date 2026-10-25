export interface SelectableEvidence {
  id: string;
  role: "before" | "event" | "after" | "representative";
  signedUrl: string | null;
}

export function preferredEvidence<T extends SelectableEvidence>(evidence: T[]) {
  const available = evidence.filter((item) => item.signedUrl);
  return (
    available.find((item) => item.role === "event") ??
    available.find((item) => item.role === "representative") ??
    available[0] ??
    evidence.find((item) => item.role === "event") ??
    evidence.find((item) => item.role === "representative") ??
    evidence[0]
  );
}
