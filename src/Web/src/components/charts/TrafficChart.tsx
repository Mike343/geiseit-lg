"use client";

import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";
import { LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import type { TrafficPoint } from "@/lib/api/types";
import { chartPalette } from "@/lib/chartTheme";
import {
  averageValue,
  formatBitRate,
  formatRateIn,
  hasData,
  latestValue,
  peakValue,
  pickRateUnit,
  seriesMax,
  toChartSeries
} from "@/lib/traffic";
import { ApexChart } from "./ApexChart";

interface TrafficChartProps {
  label: string;
  inLabel: string;
  outLabel: string;
  inPoints: TrafficPoint[];
  outPoints: TrafficPoint[];
  height?: number;
}

export function TrafficChart({ label, inLabel, outLabel, inPoints, outPoints, height = 280 }: TrafficChartProps) {
  const { resolved } = useTheme();
  const palette = chartPalette(resolved);

  const inSeries = useMemo(() => toChartSeries(inPoints), [inPoints]);
  const outSeries = useMemo(() => toChartSeries(outPoints), [outPoints]);
  const unit = useMemo(() => pickRateUnit(seriesMax(inSeries, outSeries)), [inSeries, outSeries]);
  const compact = height < 200;

  const series = useMemo(
    () => [
      { name: inLabel, data: inSeries },
      { name: outLabel, data: outSeries }
    ],
    [inLabel, outLabel, inSeries, outSeries]
  );

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "area",
        height,
        background: "transparent",
        fontFamily: "inherit",
        foreColor: palette.text,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false }
      },
      colors: [palette.series1, palette.series2],
      stroke: { width: 2, curve: "straight", dashArray: [0, 5] },
      fill: { type: "solid", opacity: [0.14, 0.04] },
      dataLabels: { enabled: false },
      markers: { size: 0, hover: { size: 4 }, strokeColors: palette.surface, strokeWidth: 2 },
      grid: { borderColor: palette.grid, strokeDashArray: 3, padding: { left: 8, right: 8 } },
      legend: {
        show: true,
        position: "top",
        horizontalAlign: "left",
        fontSize: compact ? "12px" : "13px",
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
        tickAmount: compact ? 3 : 4,
        forceNiceScale: true,
        labels: {
          minWidth: 64,
          formatter: (value: number) => formatRateIn(value, unit),
          style: { fontSize: "12px" }
        }
      },
      tooltip: {
        theme: resolved,
        shared: true,
        x: { format: "dd MMM HH:mm" },
        y: { formatter: (value: number | null) => (value === null || value === undefined ? "No data" : formatBitRate(value)) }
      },
      noData: { text: "No data" }
    }),
    [compact, height, palette, resolved, unit]
  );

  if (!hasData(inSeries, outSeries)) {
    return (
      <EmptyState
        compact
        icon={<LineChart className="size-6" />}
        title="No data for this range yet"
        description="Bandwidth samples appear here once the metrics source has collected them."
      />
    );
  }

  const rows = [
    { name: inLabel, data: inSeries },
    { name: outLabel, data: outSeries }
  ];
  const summary = `${label}. ${rows
    .map((r) => `${r.name}: latest ${formatBitRate(latestValue(r.data))}, average ${formatBitRate(averageValue(r.data))}, peak ${formatBitRate(peakValue(r.data))}.`)
    .join(" ")}`;

  return (
    <figure aria-label={summary}>
      <ApexChart type="area" height={height} options={options} series={series} />
      <figcaption className="sr-only">
        {summary} Gaps in the lines mean no data was available for that time.
      </figcaption>
      <table className="sr-only">
        <caption>{label}: summary of the plotted values</caption>
        <thead>
          <tr>
            <th scope="col">Series</th>
            <th scope="col">Latest</th>
            <th scope="col">Average</th>
            <th scope="col">Peak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}</th>
              <td>{formatBitRate(latestValue(r.data))}</td>
              <td>{formatBitRate(averageValue(r.data))}</td>
              <td>{formatBitRate(peakValue(r.data))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
