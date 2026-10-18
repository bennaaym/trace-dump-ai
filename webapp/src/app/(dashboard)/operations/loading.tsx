export default function OperationsLoading() {
  return (
    <div className="space-y-4" aria-label="Loading operations map">
      <div className="skeleton-shimmer h-16 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="skeleton-shimmer h-20 rounded-xl" />
        ))}
      </div>
      <div className="skeleton-shimmer h-[620px] rounded-xl" />
    </div>
  );
}
