"use server";

import { revalidatePath } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { preparePlaybackSchema } from "../_schemas/playback";

export const preparePlaybackAction = actionClient
  .metadata({ actionName: "prepare-incident-playback" })
  .inputSchema(preparePlaybackSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication is required.");
    const { data, error } = await supabase.rpc("request_incident_recording", {
      p_incident_id: parsedInput.incidentId,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return {
          success: false as const,
          error: "Playback preparation is not configured yet.",
        };
      }
      if (error.code === "42501") {
        return {
          success: false as const,
          error: "You are not authorized to request this recording.",
        };
      }
      throw new Error(error.message);
    }
    revalidatePath("/incidents/" + parsedInput.incidentId);
    return { success: true as const, status: data as string };
  });
