export default function Loading() {
  return (
    <div className="space-y-5" aria-label="Loading page">
      <div className="skeleton-shimmer h-16 max-w-md rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-shimmer h-28 rounded-xl" key={index} />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="skeleton-shimmer h-80 rounded-xl" />
        <div className="skeleton-shimmer h-80 rounded-xl" />
      </div>
    </div>
  );
}
