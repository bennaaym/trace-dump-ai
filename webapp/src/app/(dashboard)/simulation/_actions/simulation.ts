"use server";

import { revalidatePath } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { simulationActionSchema } from "../_schemas/simulation";

export const simulationAction = actionClient
  .metadata({ actionName: "simulation-control" })
  .inputSchema(simulationActionSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication is required.");
    if (!["operator", "admin"].includes(user.app_metadata.trace_dump_role)) {
      throw new Error("Operator authorization is required.");
    }

    let error: { message: string } | null = null;
    if (parsedInput.action === "start") {
      ({ error } = await supabase.rpc("start_simulation_monitoring", {
        p_max_hafnia_requests: 6,
      }));
    } else if (parsedInput.action === "stop") {
      ({ error } = await supabase.rpc("stop_simulation_monitoring", {
        p_run_id: parsedInput.runId,
      }));
    } else if (parsedInput.action === "switch_scene") {
      ({ error } = await supabase.rpc("request_camera_scene_switch", {
        p_cleanup_case_id: parsedInput.caseId,
        p_scene_source_id: parsedInput.sceneSourceId,
      }));
    } else {
      ({ error } = await supabase.rpc("request_cleanup_scene_recheck", {
        p_case_id: parsedInput.caseId,
      }));
    }
    if (error) return { success: false as const, error: error.message };
    revalidatePath("/simulation");
    revalidatePath("/cleanup");
    return { success: true as const, error: null };
  });
