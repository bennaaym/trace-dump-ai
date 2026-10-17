"use server";

import { redirect } from "next/navigation";

import { actionClient } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";

export const logoutAction = actionClient
  .metadata({ actionName: "logout" })
  .action(async () => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    redirect("/login");
  });
