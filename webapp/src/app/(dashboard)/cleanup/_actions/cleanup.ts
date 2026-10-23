"use server";

import { revalidatePath } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { cleanupMutationSchema } from "../_schemas/cleanup";

export const mutateCleanupCaseAction = actionClient
  .metadata({ actionName: "mutate-cleanup-case" })
  .inputSchema(cleanupMutationSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication is required.");

    if (parsedInput.action === "manual_recheck") {
      const { error } = await supabase.rpc("request_cleanup_scene_recheck", {
        p_case_id: parsedInput.caseId,
      });
      if (error) return { success: false as const, error: error.message };
      revalidatePath("/cleanup");
      return { success: true as const, error: null };
    }
    if (parsedInput.action === "acknowledge_notification") {
      const { error } = await supabase.rpc("acknowledge_cleanup_notification", {
        p_notification_id: parsedInput.notificationId!,
      });
      if (error) return { success: false as const, error: error.message };
      revalidatePath("/cleanup");
      return { success: true as const, error: null };
    }

    const changes: Record<string, string | null> = {};
    if (parsedInput.teamId !== undefined) changes.team_id = parsedInput.teamId;
    if (parsedInput.slaHours !== undefined)
      changes.sla_hours = String(parsedInput.slaHours);
    if (parsedInput.instructions !== undefined)
      changes.instructions = parsedInput.instructions;
    if (parsedInput.notes !== undefined) changes.notes = parsedInput.notes;
    if (parsedInput.resolutionOutcome !== undefined)
      changes.resolution_outcome = parsedInput.resolutionOutcome;

    const { error } = await supabase.rpc("mutate_cleanup_case", {
      p_case_id: parsedInput.caseId,
      p_action: parsedInput.action,
      p_expected_updated_at: parsedInput.expectedUpdatedAt,
      p_changes: changes,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return {
          success: false as const,
          error: "The cleanup management migration has not been applied yet.",
        };
      }
      if (error.code === "40001") {
        return {
          success: false as const,
          error:
            "Another operator changed this case. The latest data has been loaded.",
        };
      }
      if (error.code === "42501") {
        return {
          success: false as const,
          error: "You are not authorized to update cleanup cases.",
        };
      }
      return { success: false as const, error: error.message };
    }
    revalidatePath("/cleanup");
    revalidatePath("/incidents", "layout");
    revalidatePath("/operations");
    revalidatePath("/reports");
    return { success: true as const, error: null };
  });
