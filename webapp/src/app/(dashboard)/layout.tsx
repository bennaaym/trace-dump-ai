import { Suspense } from "react";

import { DashboardShell } from "./_components/dashboard-shell";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<DashboardShellFallback />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}

function DashboardShellFallback() {
  return (
    <div className="min-h-screen bg-slate-100 lg:pl-58">
      <aside className="bg-sidebar fixed inset-y-0 left-0 hidden w-58 lg:block" />
      <div className="h-16 border-b bg-white" />
      <main className="p-6">Loading workspace…</main>
    </div>
  );
}
