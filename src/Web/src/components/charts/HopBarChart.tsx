"use client";

import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";
import { useTheme } from "@/hooks/useTheme";
import { chartPalette } from "@/lib/chartTheme";
import { formatNumber } from "@/lib/format";
import { ApexChart } from "./ApexChart";

interface HopBarChartProps {
  categories: string[];
  values: (number | null)[];
  seriesName: string;
  unit: string;
  tone: "series1" | "danger";
  height?: number;
  maxY?: number;
}

export function HopBarChart({ categories, values, seriesName, unit, tone, height = 220, maxY }: HopBarChartProps) {
  const { resolved } = useTheme();
  const palette = chartPalette(resolved);
  const color = tone === "danger" ? palette.danger : palette.series1;

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "bar",
        height,
        background: "transparent",
        fontFamily: "inherit",
        foreColor: palette.text,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false }
      },
      colors: [color],
      plotOptions: { bar: { borderRadius: 4, borderRadiusApplication: "end", columnWidth: "58%" } },
      dataLabels: { enabled: false },
      stroke: { show: false },
      grid: { borderColor: palette.grid, strokeDashArray: 3, padding: { left: 8, right: 8 } },
      legend: { show: false },
      xaxis: {
        categories,
        title: { text: "Hop", style: { fontWeight: 500, fontSize: "12px" } },
        axisBorder: { color: palette.grid },
        axisTicks: { color: palette.grid },
        tooltip: { enabled: false },
        labels: { style: { fontSize: "12px" } }
      },
      yaxis: {
        min: 0,
        max: maxY,
        tickAmount: 4,
        labels: { formatter: (value: number) => `${formatNumber(value, unit === "%" ? 0 : 0)} ${unit}`, style: { fontSize: "12px" } }
      },
      tooltip: {
        theme: resolved,
        x: { formatter: (_value: number, opts?: { dataPointIndex: number }) => `Hop ${categories[opts?.dataPointIndex ?? 0] ?? ""}` },
        y: { formatter: (value: number | null) => (value === null || value === undefined ? "No response" : `${formatNumber(value, 1)} ${unit}`) }
      }
    }),
    [categories, color, height, maxY, palette, resolved, unit]
  );

  return <ApexChart type="bar" height={height} options={options} series={[{ name: seriesName, data: values }]} />;
}
