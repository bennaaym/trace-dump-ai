"use server";
import { revalidatePath } from "next/cache";
import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { prioritySchema } from "../_schemas/priority";
export const setPriorityAction = actionClient
  .metadata({ actionName: "set-incident-priority" })
  .inputSchema(prioritySchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication is required.");
    const { error } = await supabase.rpc("set_incident_priority", {
      p_incident_id: parsedInput.incidentId,
      p_level: parsedInput.level,
      p_reason: parsedInput.reason,
      p_expected_id: parsedInput.expectedId,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code))
        return {
          error:
            "Priority adjustments require the priority database migration.",
        };
      if (error.code === "40001")
        return {
          error:
            "Another reviewer changed priority. Refresh before trying again.",
        };
      if (error.code === "42501")
        return { error: "Operator authorization is required." };
      throw new Error(error.message);
    }
    revalidatePath(`/incidents/${parsedInput.incidentId}`);
    return { error: null };
  });
