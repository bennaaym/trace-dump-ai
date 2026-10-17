export default function IncidentLoading() {
  return (
    <div className="animate-pulse" aria-label="Loading incident workspace">
      <div className="mb-4 h-4 w-28 rounded bg-slate-200" />
      <div className="mb-5 rounded-xl border bg-white p-5">
        <div className="h-7 w-56 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="h-11 border-b bg-slate-50" />
          <div className="grid gap-5 p-5 lg:grid-cols-[1.35fr_1fr]">
            <div className="aspect-video rounded-xl bg-slate-200" />
            <div className="space-y-4">
              <div className="h-32 rounded-xl bg-slate-100" />
              <div className="h-44 rounded-xl bg-slate-100" />
            </div>
          </div>
        </div>
        <div className="h-80 rounded-xl border bg-white" />
      </div>
    </div>
  );
}
