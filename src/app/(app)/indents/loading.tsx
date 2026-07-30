import { Card, Skeleton } from '@/components/ui';

/*
 * Shown while the list query runs.
 *
 * The shapes match the real page — four tiles, a filter bar, eight rows — so
 * the layout does not jump when the data lands.
 */
export default function LoadingIndents() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5"
          >
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-6 w-10" />
          </div>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-5">
          <Skeleton className="h-11 min-w-56 flex-1" />
          <Skeleton className="h-11 w-44" />
          <Skeleton className="h-11 w-44" />
          <Skeleton className="h-11 w-20" />
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-6 border-b border-line px-5 py-4 last:border-0"
            >
              <Skeleton className="h-4 w-36" />
              <Skeleton className="hidden h-4 w-24 sm:block" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="ml-auto h-8 w-28 rounded-lg" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
