export default function CasesLoading() {
  return (
    <div className="space-y-4" aria-label="Loading cases">
      <div className="skeleton-shimmer h-16 rounded-xl" />
      <div className="skeleton-shimmer h-10 w-2/3 rounded-xl" />
      <div className="skeleton-shimmer h-80 rounded-xl" />
    </div>
  );
}
