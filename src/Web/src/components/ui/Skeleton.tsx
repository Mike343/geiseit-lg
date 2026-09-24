import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

export function LoadingState({ label = "Loading", lines = 3, className }: { label?: string; lines?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

const BAR_HEIGHTS = ["h-[40%]", "h-[62%]", "h-[48%]", "h-[70%]", "h-[55%]", "h-[80%]", "h-[52%]", "h-[66%]", "h-[44%]", "h-[74%]", "h-[58%]", "h-[68%]"];

export function ChartSkeleton({ className = "h-[260px]" }: { className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("flex w-full items-end gap-2 px-2 pb-6", className)}>
      <span className="sr-only">Loading chart</span>
      {BAR_HEIGHTS.map((h, i) => (
        <div key={i} aria-hidden="true" className={cn("skeleton flex-1", h)} />
      ))}
    </div>
  );
}
