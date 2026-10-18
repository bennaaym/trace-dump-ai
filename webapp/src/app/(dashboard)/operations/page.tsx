import type { Metadata } from "next";

import { getOperationsMapData } from "./_queries/operations";
import { OperationsWorkspace } from "./_components/operations-workspace";

export const metadata: Metadata = { title: "Monitor" };

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const data = await getOperationsMapData();
  return (
    <OperationsWorkspace
      data={data}
      initialCameraId={typeof params.camera === "string" ? params.camera : null}
      referenceTime={new Date().toISOString()}
    />
  );
}
