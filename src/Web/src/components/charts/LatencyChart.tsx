"use client";

import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";
import { LineChart } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import type { PerformanceSample } from "@/lib/api/types";
import { chartPalette } from "@/lib/chartTheme";
import { formatMs, formatNumber, formatUtcDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApexChart } from "./ApexChart";

interface LatencyChartProps {
  ipv4: PerformanceSample[];
  ipv6: PerformanceSample[];
  height?: number;
}

const toPoints = (samples: PerformanceSample[]) =>
  samples.map((s) => [Date.parse(s.at), s.latencyMs] as [number, number | null]);

export function LatencyChart({ ipv4, ipv6, height = 280 }: LatencyChartProps) {
  const { resolved } = useTheme();
  const palette = chartPalette(resolved);

  const series = useMemo(() => {
    const result: { name: string; data: [number, number | null][] }[] = [];
    if (ipv4.length > 0) result.push({ name: "IPv4", data: toPoints(ipv4) });
    if (ipv6.length > 0) result.push({ name: "IPv6", data: toPoints(ipv6) });
    return result;
  }, [ipv4, ipv6]);

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "line",
        height,
        background: "transparent",
        fontFamily: "inherit",
        foreColor: palette.text,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false }
      },
      colors: series.map((s) => (s.name === "IPv4" ? palette.series1 : palette.series2)),
      stroke: { width: 2, curve: "straight" },
      dataLabels: { enabled: false },
      markers: { size: 0, hover: { size: 4 }, strokeColors: palette.surface, strokeWidth: 2 },
      grid: { borderColor: palette.grid, strokeDashArray: 3, padding: { left: 8, right: 8 } },
      legend: {
        show: true,
        showForSingleSeries: true,
        position: "top",
        horizontalAlign: "left",
        fontSize: "13px",
        labels: { colors: palette.textStrong },
        markers: { size: 6, shape: "circle", strokeWidth: 0 },
        itemMargin: { horizontal: 12 }
      },
      xaxis: {
        type: "datetime",
        labels: { datetimeUTC: false, style: { fontSize: "12px" } },
        axisBorder: { color: palette.grid },
        axisTicks: { color: palette.grid },
        tooltip: { enabled: false }
      },
      yaxis: {
        min: 0,
        tickAmount: 4,
        labels: { formatter: (value: number) => `${formatNumber(value, 0)} ms`, style: { fontSize: "12px" } }
      },
      tooltip: {
        theme: resolved,
        shared: true,
        x: { format: "dd MMM HH:mm" },
        y: { formatter: (value: number | null) => (value === null || value === undefined ? "No response" : formatMs(value)) }
      },
      noData: { text: "No samples yet" }
    }),
    [height, palette, resolved, series]
  );

  const rows = useMemo(() => {
    const byTime = new Map<string, { at: string; v4: number | null | undefined; v6: number | null | undefined }>();
    for (const sample of ipv4) byTime.set(sample.at, { at: sample.at, v4: sample.latencyMs, v6: undefined });
    for (const sample of ipv6) {
      const row = byTime.get(sample.at) ?? { at: sample.at, v4: undefined, v6: undefined };
      row.v6 = sample.latencyMs;
      byTime.set(sample.at, row);
    }
    return [...byTime.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 8);
  }, [ipv4, ipv6]);

  if (series.length === 0) {
    return (
      <EmptyState
        icon={<LineChart className="size-6" />}
        title="No latency samples yet"
        description="The Looking Glass records a sample every minute. Check back shortly."
        compact
      />
    );
  }

  const missing = [ipv4.length === 0 && "IPv4", ipv6.length === 0 && "IPv6"].filter(Boolean).join(" and ");

  return (
    <figure aria-label="Latency over time, IPv4 versus IPv6">
      <ApexChart type="line" height={height} options={options} series={series} />
      {missing && <p className="text-fg-3 mt-1 text-[0.8125rem]">No {missing} samples in this window, so that series is not drawn.</p>}
      <figcaption className="sr-only">
        {series.map((s) => `${s.name}: ${s.data.length} samples.`).join(" ")} Latency in milliseconds; gaps mark failed probes.
      </figcaption>
      <details className="mt-3 text-[0.8125rem]">
        <summary className="text-fg-2 hover:text-fg w-fit cursor-pointer font-medium select-none">View recent samples as a table</summary>
        <div className="scroll-x mt-2">
          <table className="w-full min-w-max text-left">
            <caption className="sr-only">Most recent latency samples</caption>
            <thead className="text-fg-3 text-xs uppercase">
              <tr>
                <th scope="col" className="py-1.5 pr-4 font-semibold">Time (UTC)</th>
                {ipv4.length > 0 && <th scope="col" className="py-1.5 pr-4 font-semibold">IPv4</th>}
                {ipv6.length > 0 && <th scope="col" className="py-1.5 font-semibold">IPv6</th>}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {rows.map((row) => (
                <tr key={row.at}>
                  <td className="text-fg-2 py-1.5 pr-4 font-mono text-xs">{formatUtcDateTime(row.at)}</td>
                  {ipv4.length > 0 && <td className="py-1.5 pr-4">{formatMs(row.v4)}</td>}
                  {ipv6.length > 0 && <td className="py-1.5">{formatMs(row.v6)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
