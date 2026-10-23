"use server";

import { revalidatePath } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { advanceCaseSchema, assignCaseSchema } from "../../_schemas/case";

interface RpcError {
  code?: string;
  message: string;
}

function failure(error: RpcError) {
  if (error.code === "PGRST202" || error.code === "42883") {
    return "The case workflow migration has not been applied yet. Nothing was recorded.";
  }
  if (error.code === "40001") {
    return "Another operator changed this case. Refresh and try again.";
  }
  if (error.code === "42501") {
    return "You are not authorized to update this case.";
  }
  if (error.code === "22023") return error.message;
  return null;
}

async function authenticated() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication is required.");
  return supabase;
}

function revalidateCase(caseId: string) {
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
}

export const assignCaseAction = actionClient
  .metadata({ actionName: "assign-case" })
  .inputSchema(assignCaseSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await authenticated();
    const { error } = await supabase.rpc("assign_case", {
      p_case_id: parsedInput.caseId,
      p_owner_id: parsedInput.ownerId,
      p_next_action: parsedInput.nextAction,
      p_expected_status: parsedInput.expectedStatus,
    });
    if (error) {
      const message = failure(error);
      if (message) return { success: false as const, error: message };
      throw new Error(error.message);
    }
    revalidateCase(parsedInput.caseId);
    return { success: true as const, error: null };
  });

export const advanceCaseAction = actionClient
  .metadata({ actionName: "advance-case" })
  .inputSchema(advanceCaseSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await authenticated();
    const { error } = await supabase.rpc("advance_case", {
      p_case_id: parsedInput.caseId,
      p_to_status: parsedInput.toStatus,
      p_notes: parsedInput.notes,
      p_expected_status: parsedInput.expectedStatus,
    });
    if (error) {
      const message = failure(error);
      if (message) return { success: false as const, error: message };
      throw new Error(error.message);
    }
    revalidateCase(parsedInput.caseId);
    return { success: true as const, error: null };
  });
