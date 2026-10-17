import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

import {
  EmptyState,
  PageHeader,
  PreviewNotice,
} from "../_components/page-elements";

export const metadata: Metadata = { title: "Review Queue" };

export default function ReviewPage() {
  return (
    <>
      <PageHeader
        title="Review Queue"
        description="AI-detected incidents awaiting careful operator assessment."
      />
      <PreviewNotice />
      <div className="surface">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <select
            disabled
            className="h-9 rounded-lg border bg-slate-50 px-3 text-xs"
          >
            <option>Pending & needs investigation</option>
          </select>
          <select
            disabled
            className="h-9 rounded-lg border bg-slate-50 px-3 text-xs"
          >
            <option>All cameras</option>
          </select>
          <select
            disabled
            className="h-9 rounded-lg border bg-slate-50 px-3 text-xs"
          >
            <option>Oldest first</option>
          </select>
        </div>
        <EmptyState
          icon={ClipboardCheck}
          title="The review queue is empty"
          description="Pending and needs-investigation incidents will appear here. Confidence and priority are intentionally omitted because the current schema does not support them."
        />
      </div>
    </>
  );
}
