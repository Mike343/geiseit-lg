import { cn } from "@/lib/cn";
import { TONE_TEXT, type Tone } from "@/lib/tones";

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}

export function StatTile({ label, value, hint, tone = "neutral", icon }: StatTileProps) {
  return (
    <div className="bg-subtle border-line rounded-xl border px-4 py-3">
      <p className="text-fg-3 flex items-center gap-1.5 text-xs font-medium">
        {label}
      </p>
      <p className={cn("mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums", tone === "neutral" ? "text-fg" : TONE_TEXT[tone])}>
        {icon}
        {value}
      </p>
      {hint && <p className="text-fg-3 mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
