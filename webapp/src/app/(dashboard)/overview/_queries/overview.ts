import { connection } from "next/server";

import { authenticatedClient } from "../../_lib/data";
import type { CameraRecord } from "../../_lib/types";
import { getIncidents } from "../../incidents/_queries/incidents";

export async function getOverview() {
  await connection();
  const { supabase } = await authenticatedClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [incidents, confirmed, pending, camerasResult, detectionsResult] =
    await Promise.all([
      getIncidents(),
      supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "confirmed"),
      supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .in("review_status", ["pending_review", "needs_investigation"]),
      supabase
        .from("cameras")
        .select(
          "id,name,latitude,longitude,location_source,enabled,status,last_seen_at",
        )
        .order("name"),
      supabase
        .from("detections")
        .select("created_at")
        .gte("created_at", since)
        .order("created_at"),
    ]);
  if (
    confirmed.error ||
    pending.error ||
    camerasResult.error ||
    detectionsResult.error
  ) {
    throw new Error("Unable to load overview metrics.");
  }
  const cameras: CameraRecord[] = (camerasResult.data ?? []).map((camera) => ({
    id: camera.id,
    name: camera.name,
    latitude: camera.latitude,
    longitude: camera.longitude,
    locationSource: camera.location_source as "real" | "simulated",
    enabled: camera.enabled,
    status: camera.status as CameraRecord["status"],
    lastSeenAt: camera.last_seen_at,
  }));
  const activity = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.now() - (6 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      day,
      count: (detectionsResult.data ?? []).filter((row) =>
        row.created_at.startsWith(day),
      ).length,
    };
  });
  return {
    incidentCount: incidents.count,
    confirmedCount: confirmed.count ?? 0,
    pendingCount: pending.count ?? 0,
    monitoredCount: cameras.filter((camera) => camera.enabled).length,
    cameras,
    recentIncidents: incidents.items.slice(0, 5),
    activity,
  };
}
