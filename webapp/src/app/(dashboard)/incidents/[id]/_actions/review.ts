"use server";

import { revalidatePath } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { reviewIncidentSchema } from "../_schemas/review";

export const reviewIncidentAction = actionClient
  .metadata({ actionName: "review-incident" })
  .inputSchema(reviewIncidentSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication is required.");

    const { error } = await supabase.rpc("review_incident", {
      p_incident_id: parsedInput.incidentId,
      p_decision: parsedInput.decision,
      p_notes: parsedInput.notes,
      p_expected_status: parsedInput.expectedStatus,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return {
          success: false as const,
          error:
            "The secure review workflow migration has not been applied yet. No decision was recorded.",
        };
      }
      if (error.code === "40001" || error.message.includes("review changed")) {
        return {
          success: false as const,
          error:
            "Another operator changed this incident. Refresh and review the latest decision before trying again.",
        };
      }
      if (error.code === "42501") {
        return {
          success: false as const,
          error: "You are not authorized to review this incident.",
        };
      }
      if (error.message.includes("already has review status")) {
        return {
          success: false as const,
          error:
            "This decision has already been recorded. Refresh the incident.",
        };
      }
      throw new Error(error.message);
    }

    revalidatePath(`/incidents/${parsedInput.incidentId}`);
    revalidatePath("/incidents");
    revalidatePath("/review");
    revalidatePath("/operations");
    revalidatePath("/reports");
    revalidatePath("/cases");
    return { success: true as const, error: null };
  });
