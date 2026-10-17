import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function IncidentNotFound() {
  return (
    <div className="grid min-h-96 place-items-center rounded-xl border bg-white p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <FileQuestion className="size-5" />
        </span>
        <h1 className="font-heading mt-4 text-lg font-bold text-slate-900">
          Incident not found
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          This incident does not exist or is not available to your account.
        </p>
        <Link
          href="/incidents"
          className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Back to incidents
        </Link>
      </div>
    </div>
  );
}
