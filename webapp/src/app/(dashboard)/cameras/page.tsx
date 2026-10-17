import type { Metadata } from "next";
import { Plus } from "lucide-react";

import {
  EmptyTable,
  PageHeader,
  PreviewNotice,
} from "../_components/page-elements";

export const metadata: Metadata = { title: "Cameras" };

export default function CamerasPage() {
  return (
    <>
      <PageHeader
        title="Cameras"
        description="Monitor camera connectivity, recording availability and analysis readiness."
        actions={
          <button
            disabled
            title="Camera provisioning requires a secure integration"
            className="bg-primary inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white opacity-50"
          >
            <Plus className="size-4" />
            Add camera
          </button>
        }
      />
      <PreviewNotice compact />
      <div className="my-4 grid gap-3 rounded-xl border bg-white p-3 sm:grid-cols-3">
        <select
          disabled
          className="h-9 rounded-lg border bg-slate-50 px-3 text-xs text-slate-500"
        >
          <option>All statuses</option>
        </select>
        <input
          disabled
          placeholder="Search cameras…"
          className="h-9 rounded-lg border bg-slate-50 px-3 text-sm"
        />
        <select
          disabled
          className="h-9 rounded-lg border bg-slate-50 px-3 text-xs text-slate-500"
        >
          <option>Monitoring state</option>
        </select>
      </div>
      <EmptyTable
        columns={[
          "Camera",
          "Location",
          "Connectivity",
          "Recording",
          "Monitoring",
          "Last seen",
          "Last analyzed",
          "",
        ]}
        title="No cameras available"
        description="The known demonstration camera names are not rendered as live records. Cameras will appear here when server-side Supabase reads are connected."
      />
    </>
  );
}
