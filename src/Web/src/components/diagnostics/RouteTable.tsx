import { AlertTriangle, Lock, Timer } from "lucide-react";
import { MiniBar } from "@/components/charts/MiniBar";
import { DataTable } from "@/components/ui/NetworkTable";
import type { MtrHop, TracerouteHop } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { EM_DASH, formatMs, formatFixed } from "@/lib/format";

type AnyHop = Pick<TracerouteHop | MtrHop, "hop" | "responded" | "redacted" | "address" | "hostname">;

export function HopHost({ hop }: { hop: AnyHop }) {
  if (!hop.responded) {
    return (
      <span className="text-fg-3 inline-flex items-center gap-1.5 italic">
        <Timer aria-hidden="true" className="size-4" />
        <span aria-hidden="true" className="font-mono">* * *</span>
        <span>No response</span>
      </span>
    );
  }
  if (hop.redacted) {
    return (
      <span className="text-fg-2 inline-flex items-center gap-1.5">
        <Lock aria-hidden="true" className="size-4" />
        Internal network
      </span>
    );
  }
  return <span className="text-fg font-medium break-all">{hop.hostname ?? hop.address ?? EM_DASH}</span>;
}

const rowClass = (responded: boolean) => (responded ? "" : "bg-subtle/60");
const cell = (responded: boolean) => cn("px-3.5 py-2.5", !responded && "border-b border-dashed border-line-strong");

export function TracerouteTable({ hops }: { hops: TracerouteHop[] }) {
  const max = Math.max(1, ...hops.map((h) => h.avgMs ?? 0));
  return (
    <DataTable
      caption="Traceroute hops"
      head={["Hop", "Host", "IP", "Probes", { label: "Avg", align: "right" }, "Latency"]}
    >
      {hops.map((hop) => (
        <tr key={hop.hop} className={cn("hover:bg-subtle transition-colors", rowClass(hop.responded))}>
          <td className={cn(cell(hop.responded), "text-fg-3 font-mono tabular-nums")}>{hop.hop}</td>
          <td className={cell(hop.responded)}>
            <HopHost hop={hop} />
          </td>
          <td className={cn(cell(hop.responded), "text-fg-2 font-mono text-xs")}>{hop.redacted || !hop.address ? EM_DASH : hop.address}</td>
          <td className={cn(cell(hop.responded), "text-fg-2 font-mono text-xs whitespace-nowrap")}>
            {hop.responded ? hop.rttMs.map((v) => (v === null ? "*" : formatFixed(v, 1))).join("  ") : EM_DASH}
          </td>
          <td className={cn(cell(hop.responded), "text-right font-semibold tabular-nums whitespace-nowrap")}>{formatMs(hop.avgMs)}</td>
          <td className={cn(cell(hop.responded), "w-40 min-w-32")}>
            {hop.avgMs !== null ? <MiniBar value={hop.avgMs} max={max} label={`Hop ${hop.hop} average ${formatMs(hop.avgMs)}`} /> : null}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

function LossCell({ value }: { value: number }) {
  if (value <= 0) return <span className="text-fg-2 tabular-nums">0%</span>;
  const severe = value >= 20;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold tabular-nums",
        severe ? "bg-danger-soft text-danger border-danger-line" : "bg-warning-soft text-warning border-warning-line"
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{severe ? "High loss:" : "Loss:"}</span>
      {Number(value.toFixed(1))}%
    </span>
  );
}

export function MtrTable({ hops }: { hops: MtrHop[] }) {
  const num = (v: number | null, responded: boolean) => (responded ? formatFixed(v, 1) : EM_DASH);
  return (
    <DataTable
      caption="MTR statistics per hop"
      head={[
        "Hop",
        "Host",
        "IP",
        { label: "Loss %", align: "right" },
        { label: "Sent", align: "right" },
        { label: "Last", align: "right" },
        { label: "Avg", align: "right" },
        { label: "Best", align: "right" },
        { label: "Worst", align: "right" },
        { label: "StDev", align: "right" }
      ]}
    >
      {hops.map((hop) => (
        <tr key={hop.hop} className={cn("hover:bg-subtle transition-colors", rowClass(hop.responded))}>
          <td className={cn(cell(hop.responded), "text-fg-3 font-mono tabular-nums")}>{hop.hop}</td>
          <td className={cell(hop.responded)}>
            <HopHost hop={hop} />
          </td>
          <td className={cn(cell(hop.responded), "text-fg-2 font-mono text-xs")}>{hop.redacted || !hop.address ? EM_DASH : hop.address}</td>
          <td className={cn(cell(hop.responded), "text-right whitespace-nowrap")}>
            <LossCell value={hop.lossPercent} />
          </td>
          <td className={cn(cell(hop.responded), "text-right tabular-nums")}>{hop.sent}</td>
          <td className={cn(cell(hop.responded), "text-right tabular-nums")}>{num(hop.lastMs, hop.responded)}</td>
          <td className={cn(cell(hop.responded), "text-right font-semibold tabular-nums")}>{num(hop.avgMs, hop.responded)}</td>
          <td className={cn(cell(hop.responded), "text-right tabular-nums")}>{num(hop.bestMs, hop.responded)}</td>
          <td className={cn(cell(hop.responded), "text-right tabular-nums")}>{num(hop.worstMs, hop.responded)}</td>
          <td className={cn(cell(hop.responded), "text-right tabular-nums")}>{num(hop.stdDevMs, hop.responded)}</td>
        </tr>
      ))}
    </DataTable>
  );
}

export function RouteTable(props: { type: "traceroute"; hops: TracerouteHop[] } | { type: "mtr"; hops: MtrHop[] }) {
  return props.type === "traceroute" ? <TracerouteTable hops={props.hops} /> : <MtrTable hops={props.hops} />;
}
