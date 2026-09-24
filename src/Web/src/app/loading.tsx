import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading page</span>
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-8 h-9 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
