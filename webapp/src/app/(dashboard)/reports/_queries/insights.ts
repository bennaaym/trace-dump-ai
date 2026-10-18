import { authenticatedClient } from "../../_lib/data";
import {
  buildInsightsData,
  type InsightAnalysisRow,
  type InsightCameraRow,
  type InsightDetectionRow,
  type InsightIncidentRow,
  type InsightReviewRow,
  type InsightsRange,
} from "../_lib/insights-data";

export async function getInsights(range: InsightsRange, referenceTime: string) {
  const { supabase } = await authenticatedClient();
  const [incidents, detections, reviews, analyses, cameras] = await Promise.all(
    [
      supabase
        .from("incidents")
        .select("id,detection_id,review_status,occurred_at,created_at"),
      supabase.from("detections").select("id,camera_id"),
      supabase.from("incident_reviews").select("incident_id,created_at"),
      supabase.from("analyses").select("id,status,dumping_detected,created_at"),
      supabase.from("cameras").select("id,name"),
    ],
  );

  const error =
    incidents.error ??
    detections.error ??
    reviews.error ??
    analyses.error ??
    cameras.error;
  if (error) throw new Error(`Unable to load Insights data: ${error.message}`);

  return buildInsightsData(
    {
      incidents: (incidents.data ?? []) as InsightIncidentRow[],
      detections: (detections.data ?? []) as InsightDetectionRow[],
      reviews: (reviews.data ?? []) as InsightReviewRow[],
      analyses: (analyses.data ?? []) as InsightAnalysisRow[],
      cameras: (cameras.data ?? []) as InsightCameraRow[],
    },
    range,
    referenceTime,
  );
}
