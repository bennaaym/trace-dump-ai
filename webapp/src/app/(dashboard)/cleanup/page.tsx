import type { Metadata } from "next";

import { CleanupWorkspace } from "./_components/cleanup-workspace";
import { getCleanupWorkspaceData } from "./_queries/cleanup";

export const metadata: Metadata = { title: "Cleanup" };

export default async function CleanupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, query] = await Promise.all([
    getCleanupWorkspaceData(),
    searchParams,
  ]);
  const selectedCase = typeof query.case === "string" ? query.case : null;
  return <CleanupWorkspace data={data} initialCaseId={selectedCase} />;
}
