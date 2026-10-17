import type { DashboardSnapshot } from "../_lib/types";

/** Server-only integration boundary. Replace the empty result with authenticated Supabase queries. */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return {
    cameras: [],
    incidents: [],
    detections: [],
    analyses: [],
    evidence: [],
    reviews: [],
    source: "not_configured",
  };
}

export async function getIncidentById(_id: string) {
  const snapshot = await getDashboardSnapshot();
  return snapshot.incidents.find((item) => item.id === _id) ?? null;
}
export async function getCameraById(_id: string) {
  const snapshot = await getDashboardSnapshot();
  return snapshot.cameras.find((item) => item.id === _id) ?? null;
}
