import { cn } from "@/lib/cn";
import { TONE_TEXT, type Tone } from "@/lib/tones";
import { Skeleton } from "./Skeleton";

interface MetricCardProps {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
  className?: string;
}

export function MetricCard({ label, icon, value, caption, tone = "neutral", loading, className }: MetricCardProps) {
  return (
    <div className={cn("card card-hover flex flex-col gap-3 p-5", className)}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="bg-subtle text-fg-2 grid size-9 place-items-center rounded-xl">
          {icon}
        </span>
        <h3 className="text-fg-2 text-sm font-medium">{label}</h3>
      </div>
      {loading ? (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">Loading {label}</span>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3.5 w-36" />
        </div>
      ) : (
        <div>
          <p className={cn("flex items-center gap-2 text-[1.625rem] leading-8 font-semibold tracking-tight tabular-nums", tone === "neutral" ? "text-fg" : TONE_TEXT[tone])}>
            {value}
          </p>
          {caption && <p className="text-fg-3 mt-1 text-[0.8125rem] leading-5">{caption}</p>}
        </div>
      )}
    </div>
  );
}
