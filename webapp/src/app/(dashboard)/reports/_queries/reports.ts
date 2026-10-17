import { connection } from "next/server";

import { authenticatedClient } from "../../_lib/data";
import type { ReviewStatus } from "../../_lib/types";

export async function getReports() {
  await connection();
  const { supabase } = await authenticatedClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [detections, incidents, reviews, cameras] = await Promise.all([
    supabase
      .from("detections")
      .select("id,camera_id,created_at", { count: "exact" })
      .gte("created_at", since),
    supabase
      .from("incidents")
      .select("id,detection_id,review_status,occurred_at")
      .gte("created_at", since),
    supabase
      .from("incident_reviews")
      .select("id,decision,created_at", { count: "exact" })
      .gte("created_at", since),
    supabase.from("cameras").select("id,name"),
  ]);
  if (detections.error || incidents.error || reviews.error || cameras.error)
    throw new Error("Unable to load report statistics.");
  const incidentRows = incidents.data ?? [];
  const statuses: ReviewStatus[] = [
    "pending_review",
    "needs_investigation",
    "confirmed",
    "dismissed",
  ];
  const byStatus = statuses.map((key) => ({
    key,
    count: incidentRows.filter((row) => row.review_status === key).length,
  }));
  const byDay = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(Date.now() - (29 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      day,
      count: incidentRows.filter((row) =>
        (row.occurred_at ?? "").startsWith(day),
      ).length,
    };
  });
  const detectionCamera = new Map(
    (detections.data ?? []).map((row) => [row.id, row.camera_id]),
  );
  const cameraNames = new Map(
    (cameras.data ?? []).map((row) => [row.id, row.name]),
  );
  const cameraCounts = new Map<string, number>();
  for (const incident of incidentRows) {
    const cameraId = detectionCamera.get(incident.detection_id);
    if (cameraId)
      cameraCounts.set(cameraId, (cameraCounts.get(cameraId) ?? 0) + 1);
  }
  return {
    detectionCount: detections.count ?? 0,
    suspectedCount: incidentRows.filter(
      (row) => row.review_status === "pending_review",
    ).length,
    investigationCount: incidentRows.filter(
      (row) => row.review_status === "needs_investigation",
    ).length,
    confirmedCount: incidentRows.filter(
      (row) => row.review_status === "confirmed",
    ).length,
    dismissedCount: incidentRows.filter(
      (row) => row.review_status === "dismissed",
    ).length,
    reviewCount: reviews.count ?? 0,
    byStatus,
    byDay,
    byCamera: [...cameraCounts].map(([cameraId, value]) => ({
      label: cameraNames.get(cameraId) ?? cameraId,
      value,
    })),
  };
}
