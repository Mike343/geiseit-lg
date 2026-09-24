import type { DnsResult, MtrResult, PingResult, TracerouteResult } from "@/lib/api/types";
import { formatMs, formatPercent, pluralize } from "./format";

export function summarizePing(result: PingResult): string[] {
  if (result.received === 0) {
    return [`No replies received from ${result.destination}`, `${formatPercent(result.lossPercent)} packet loss`];
  }
  return [`${formatMs(result.avgMs)} average latency`, `${formatPercent(result.lossPercent)} packet loss`];
}

export function countRespondingHops(hops: { responded: boolean }[]): number {
  return hops.filter((h) => h.responded).length;
}

export function summarizeTraceroute(result: TracerouteResult): string[] {
  const responding = countRespondingHops(result.hops);
  const lines = [`Route contains ${pluralize(responding, "responding hop")}`];
  const silent = result.hops.length - responding;
  if (silent > 0) lines.push(`${pluralize(silent, "hop")} did not respond`);
  lines.push(result.reachedDestination ? "Destination reached" : "Destination was not reached");
  return lines;
}

export function summarizeMtr(result: MtrResult): string[] {
  const responding = countRespondingHops(result.hops);
  const last = [...result.hops].reverse().find((h) => h.responded);
  const lines = [`Route contains ${pluralize(responding, "responding hop")} over ${pluralize(result.cycles, "cycle")}`];
  if (last) lines.push(`${formatMs(last.avgMs)} average latency and ${formatPercent(last.lossPercent)} loss at the final hop`);
  return lines;
}

export function summarizeDns(result: DnsResult): string[] {
  if (result.status === "nxdomain") return [`${result.name} does not exist (NXDOMAIN)`];
  if (result.status === "nodata") return [`${result.name} exists but has no ${result.recordType} records`];
  return [`${pluralize(result.records.length, "record")} found for ${result.name}`];
}
