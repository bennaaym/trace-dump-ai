import { redirect } from "next/navigation";
import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function authenticatedClient() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function signedEvidenceUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await supabase.storage
    .from("incident-evidence")
    .createSignedUrls(paths, 300);
  if (error) return new Map<string, string>();
  return new Map(
    data.flatMap((item) =>
      item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
}
