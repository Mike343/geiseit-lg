import type { TrafficNode, TrafficPoint, TrafficRange } from "@/lib/api/types";
import { EM_DASH } from "@/lib/format";

export const TRAFFIC_RANGES: { id: TrafficRange; label: string; step: string }[] = [
  { id: "1h", label: "1 hour", step: "30 seconds" },
  { id: "6h", label: "6 hours", step: "2 minutes" },
  { id: "24h", label: "24 hours", step: "5 minutes" }
];

export const DEFAULT_TRAFFIC_RANGE: TrafficRange = "1h";

export function parseTrafficRange(value: string | string[] | null | undefined): TrafficRange {
  const first = Array.isArray(value) ? value[0] : value;
  return TRAFFIC_RANGES.find((r) => r.id === first)?.id ?? DEFAULT_TRAFFIC_RANGE;
}

export interface RateUnit {
  label: string;
  divisor: number;
}

const UNITS: RateUnit[] = [
  { label: "bit/s", divisor: 1 },
  { label: "kbit/s", divisor: 1e3 },
  { label: "Mbit/s", divisor: 1e6 },
  { label: "Gbit/s", divisor: 1e9 }
];

export function pickRateUnit(bitsPerSecond: number): RateUnit {
  const magnitude = Math.abs(bitsPerSecond);
  for (let i = UNITS.length - 1; i > 0; i--) {
    const unit = UNITS[i]!;
    if (magnitude >= unit.divisor) return unit;
  }
  return UNITS[0]!;
}

function decimalsFor(value: number): number {
  const magnitude = Math.abs(value);
  return magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
}

export function formatRateIn(bitsPerSecond: number, unit: RateUnit): string {
  const scaled = bitsPerSecond / unit.divisor;
  const digits = unit.divisor === 1 ? 0 : decimalsFor(scaled);
  return `${Number(scaled.toFixed(digits))} ${unit.label}`;
}

export function formatBitRate(bitsPerSecond: number | null | undefined): string {
  if (bitsPerSecond === null || bitsPerSecond === undefined || !Number.isFinite(bitsPerSecond)) return EM_DASH;
  let unit = pickRateUnit(bitsPerSecond);
  const next = UNITS[UNITS.indexOf(unit) + 1];
  if (next && Math.round(bitsPerSecond / unit.divisor) >= 1000) unit = next;
  return formatRateIn(bitsPerSecond, unit);
}

export type ChartPointTuple = [number, number | null];

export function toChartSeries(points: TrafficPoint[]): ChartPointTuple[] {
  const result: ChartPointTuple[] = [];
  for (const point of points) {
    const at = Date.parse(point.at);
    if (Number.isNaN(at)) continue;
    const value = point.bitsPerSecond;
    result.push([at, value === null || !Number.isFinite(value) ? null : value]);
  }
  return result.sort((a, b) => a[0] - b[0]);
}

export function seriesMax(...series: ChartPointTuple[][]): number {
  let max = 0;
  for (const s of series) for (const [, v] of s) if (v !== null && v > max) max = v;
  return max;
}

export function latestValue(series: ChartPointTuple[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i]![1];
    if (v !== null) return v;
  }
  return null;
}

export function averageValue(series: ChartPointTuple[]): number | null {
  let sum = 0;
  let count = 0;
  for (const [, v] of series) {
    if (v !== null) {
      sum += v;
      count++;
    }
  }
  return count === 0 ? null : sum / count;
}

export function peakValue(series: ChartPointTuple[]): number | null {
  let peak: number | null = null;
  for (const [, v] of series) if (v !== null && (peak === null || v > peak)) peak = v;
  return peak;
}

export function hasData(...series: ChartPointTuple[][]): boolean {
  return series.some((s) => s.some(([, v]) => v !== null));
}

export function utilisationPercent(rx: number | null, tx: number | null, capacityBitsPerSecond: number | null): number | null {
  if (capacityBitsPerSecond === null || !Number.isFinite(capacityBitsPerSecond) || capacityBitsPerSecond <= 0) return null;
  if (rx === null && tx === null) return null;
  return (Math.max(rx ?? 0, tx ?? 0) / capacityBitsPerSecond) * 100;
}

export function formatUtilisation(percent: number): string {
  if (percent > 0 && percent < 0.1) return "<0.1%";
  return `${Number(percent.toFixed(percent >= 10 ? 0 : 1))}%`;
}

export function nodeUtilisationLabel(node: TrafficNode): string | null {
  const percent = utilisationPercent(
    latestValue(toChartSeries(node.rx)),
    latestValue(toChartSeries(node.tx)),
    node.capacityBitsPerSecond
  );
  if (percent === null || node.capacityBitsPerSecond === null) return null;
  return `${formatUtilisation(percent)} of ${formatBitRate(node.capacityBitsPerSecond)}`;
}
