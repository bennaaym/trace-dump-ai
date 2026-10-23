"use client";

export default function CleanupError({ reset }: { reset: () => void }) {
  return (
    <div className="surface mx-auto max-w-xl p-8 text-center">
      <h1 className="text-lg font-bold text-slate-900">
        Cleanup data unavailable
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        The cleanup workspace could not be loaded. Check that the cleanup
        migration is deployed, then try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
