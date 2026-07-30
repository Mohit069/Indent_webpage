import { Card, Skeleton } from '@/components/ui';

export default function LoadingIndent() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-56" />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-5 w-28 rounded-md" />
        </div>
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <div className="border-b border-line px-5 py-4">
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="border-b border-line px-5 py-4">
              <Skeleton className="h-4 w-16" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-6 border-b border-line px-5 py-4 last:border-0"
              >
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="ml-auto h-4 w-12" />
              </div>
            ))}
          </Card>
        </div>

        <Card>
          <div className="border-b border-line px-5 py-4">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-4 w-48" />
          </div>
        </Card>
      </div>
    </div>
  );
}
