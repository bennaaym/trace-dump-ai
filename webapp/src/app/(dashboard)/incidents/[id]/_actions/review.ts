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
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/incidents/${parsedInput.incidentId}`);
    revalidatePath("/incidents");
    revalidatePath("/review");
    revalidatePath("/overview");
    revalidatePath("/reports");
    return { success: true as const };
  });
