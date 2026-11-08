export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-line p-6 bg-surface">
      <Skeleton className="w-11 h-11 rounded-xl mb-5" />
      <Skeleton className="h-5 w-1/2 mb-3" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonTable({ rows = 4 }) {
  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-line/60 last:border-0">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-line rounded-2xl p-5">
          <Skeleton className="h-3 w-1/2 mb-4" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ))}
    </div>
  );
}
