"use client";

import { TriangleAlert } from "lucide-react";

export default function IncidentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-96 place-items-center rounded-xl border bg-white p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-red-50 text-red-600">
          <TriangleAlert className="size-5" />
        </span>
        <h1 className="font-heading mt-4 text-lg font-bold text-slate-900">
          Incident workspace unavailable
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          The incident data or private evidence could not be loaded. Your review
          data has not been changed.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
