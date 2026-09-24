import { CheckCircle2, Info, SearchX } from "lucide-react";
import { HopBarChart } from "@/components/charts/HopBarChart";
import { ReplyBars } from "@/components/charts/ReplyBars";
import { DataTable } from "@/components/ui/NetworkTable";
import { StatTile } from "@/components/ui/StatTile";
import type { DnsResult, MtrResult, PingResult, TracerouteResult } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { EM_DASH, formatMs, formatPercent } from "@/lib/format";
import { summarizeDns, summarizeMtr, summarizePing, summarizeTraceroute } from "@/lib/summary";
import type { Tone } from "@/lib/tones";
import { RouteTable } from "./RouteTable";

function Headline({ lines, tone = "success", emphasize = false }: { lines: string[]; tone?: "success" | "warning" | "danger" | "info"; emphasize?: boolean }) {
  const [first, ...rest] = lines;
  const color = { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info" }[tone];
  return (
    <div>
      <p className="text-fg text-xl leading-snug font-semibold sm:text-2xl">{first}</p>
      {rest.map((line) => (
        <p key={line} className={cn("mt-1 text-[0.9375rem] font-medium", emphasize ? color : "text-fg-2")}>
          {line}
        </p>
      ))}
    </div>
  );
}

const lossTone = (loss: number): Tone => (loss <= 0 ? "success" : loss >= 20 ? "danger" : "warning");

export function PingSummary({ result }: { result: PingResult }) {
  const tone = result.received === 0 ? "danger" : result.lossPercent > 0 ? "warning" : "success";
  return (
    <div className="space-y-5">
      <Headline lines={summarizePing(result)} tone={tone} emphasize />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Sent" value={result.transmitted} />
        <StatTile label="Received" value={result.received} />
        <StatTile label="Packet loss" value={formatPercent(result.lossPercent)} tone={lossTone(result.lossPercent)} />
        <StatTile label="Minimum" value={formatMs(result.minMs)} />
        <StatTile label="Average" value={formatMs(result.avgMs)} />
        <StatTile label="Maximum" value={formatMs(result.maxMs)} />
        <StatTile label="Std deviation" value={formatMs(result.stdDevMs)} />
      </div>
      {result.replies.length > 0 || result.transmitted > 0 ? <ReplyBars replies={result.replies} transmitted={result.transmitted} /> : null}
    </div>
  );
}

export function TracerouteSummary({ result }: { result: TracerouteResult }) {
  const responding = result.hops.filter((h) => h.responded);
  const last = [...responding].reverse()[0];
  return (
    <div className="space-y-5">
      <Headline lines={summarizeTraceroute(result)} tone={result.reachedDestination ? "success" : "warning"} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total hops" value={result.hops.length} />
        <StatTile label="Responding" value={responding.length} />
        <StatTile label="Timeouts" value={result.hops.length - responding.length} tone={result.hops.length > responding.length ? "warning" : "neutral"} />
        <StatTile label="Last hop average" value={formatMs(last?.avgMs)} />
      </div>
      <RouteTable type="traceroute" hops={result.hops} />
    </div>
  );
}

export function MtrSummary({ result }: { result: MtrResult }) {
  const hops = result.hops;
  const categories = hops.map((h) => String(h.hop));
  const avgValues = hops.map((h) => (h.responded ? h.avgMs : null));
  const lossValues = hops.map((h) => h.lossPercent);
  const anyLoss = lossValues.some((v) => v > 0);
  const last = [...hops].reverse().find((h) => h.responded);
  const worst = hops.reduce<(typeof hops)[number] | null>((acc, h) => (h.responded && (acc === null || (h.avgMs ?? 0) > (acc.avgMs ?? 0)) ? h : acc), null);

  return (
    <div className="space-y-5">
      <Headline lines={summarizeMtr(result)} tone={(last?.lossPercent ?? 0) > 0 ? "warning" : "success"} emphasize />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Hops" value={hops.length} />
        <StatTile label="Final loss" value={formatPercent(last?.lossPercent)} tone={lossTone(last?.lossPercent ?? 0)} />
        <StatTile label="Final average" value={formatMs(last?.avgMs)} />
        <StatTile label="Slowest hop" value={worst ? `#${worst.hop}` : EM_DASH} hint={worst ? formatMs(worst.avgMs) : undefined} />
      </div>
      <div className={cn("grid gap-4", anyLoss ? "lg:grid-cols-2" : "")}>
        <section aria-label="Average latency by hop" className="border-line rounded-xl border p-4">
          <h3 className="text-fg mb-2 text-sm font-semibold">Average latency by hop</h3>
          <HopBarChart categories={categories} values={avgValues} seriesName="Average latency" unit="ms" tone="series1" />
        </section>
        {anyLoss ? (
          <section aria-label="Packet loss by hop" className="border-line rounded-xl border p-4">
            <h3 className="text-fg mb-2 text-sm font-semibold">Packet loss by hop</h3>
            <HopBarChart categories={categories} values={lossValues} seriesName="Packet loss" unit="%" tone="danger" maxY={100} />
          </section>
        ) : (
          <p className="text-success bg-success-soft border-success-line flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            No packet loss was observed at any hop.
          </p>
        )}
      </div>
      <RouteTable type="mtr" hops={hops} />
    </div>
  );
}

const DNS_STATUS_TEXT = { ok: "Answered", nodata: "No data", nxdomain: "Does not exist" };

export function DnsSummary({ result }: { result: DnsResult }) {
  return (
    <div className="space-y-5">
      <Headline
        lines={summarizeDns(result)}
        tone={result.status === "ok" ? "success" : result.status === "nxdomain" ? "danger" : "info"}
      />
      {result.status === "ok" && result.records.length > 0 ? (
        <DataTable caption={`${result.recordType} records for ${result.name}`} head={["Record", "TTL", "Value"]}>
          {result.records.map((record, index) => (
            <tr key={`${record.name}-${record.type}-${index}`} className="hover:bg-subtle transition-colors align-top">
              <td className="px-3.5 py-2.5 whitespace-nowrap">
                <span className="bg-brand-soft text-brand-fg rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold">{record.type}</span>
                <span className="text-fg-2 ml-2 font-mono text-xs">{record.name}</span>
              </td>
              <td className="text-fg-2 px-3.5 py-2.5 whitespace-nowrap tabular-nums">{record.ttl} s</td>
              <td className="text-fg px-3.5 py-2.5 font-mono text-[0.8125rem] break-all">{record.value}</td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <div className="bg-info-soft border-info-line text-info flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
          {result.status === "nxdomain" ? <SearchX aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
          <p className="text-fg-2">
            <span className="text-fg font-semibold">{DNS_STATUS_TEXT[result.status]}. </span>
            {result.status === "nxdomain"
              ? "The name could not be found. Check the spelling, or the domain may not be registered."
              : `The name exists, but it has no ${result.recordType} records.`}
          </p>
        </div>
      )}
    </div>
  );
}
