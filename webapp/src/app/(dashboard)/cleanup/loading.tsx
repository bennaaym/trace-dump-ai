export default function CleanupLoading() {
  return (
    <div aria-label="Loading cleanup cases" className="animate-pulse">
      <div className="h-8 w-44 rounded bg-slate-200" />
      <div className="mt-2 h-4 w-72 rounded bg-slate-200" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="surface skeleton-shimmer h-24" />
        ))}
      </div>
      <div className="surface skeleton-shimmer mt-4 h-96" />
    </div>
  );
}
