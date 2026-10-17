"use server";

import { redirect } from "next/navigation";

import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "../_schemas/login";

export const loginAction = actionClient
  .metadata({ actionName: "login" })
  .inputSchema(loginSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsedInput);

    if (error) {
      return {
        success: false as const,
        message: "Invalid email or password.",
      };
    }

    redirect("/overview");
  });
