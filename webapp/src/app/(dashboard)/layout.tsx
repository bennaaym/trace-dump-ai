import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "./_components/dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DashboardShellFallback />}>
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}

async function AuthenticatedDashboard({ children }: { children: ReactNode }) {
  // This subtree is authenticated and depends on request-time Supabase data.
  // It also contains rolling date windows that must not run during prerendering.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DashboardShell
      userEmail={user.email ?? "Signed-in user"}
      canUseSimulation={["operator", "admin"].includes(
        user.app_metadata.trace_dump_role,
      )}
    >
      {children}
    </DashboardShell>
  );
}

function DashboardShellFallback() {
  return (
    <div className="min-h-screen bg-slate-100 lg:pl-58">
      <aside className="bg-sidebar fixed inset-y-0 left-0 hidden w-58 lg:block" />
      <div className="h-16 border-b bg-white" />
      <main className="p-6">Verifying session…</main>
    </div>
  );
}
