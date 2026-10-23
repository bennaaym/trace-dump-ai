import Link from "next/link";

export default function CaseNotFound() {
  return (
    <div className="surface p-8 text-center">
      <h1 className="font-heading text-lg font-bold text-slate-900">
        Case not found
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        It may not exist, or the case workflow migration may not be applied.
      </p>
      <Link
        href="/cases"
        className="mt-4 inline-block text-xs font-semibold text-teal-700"
      >
        Back to cases
      </Link>
    </div>
  );
}
