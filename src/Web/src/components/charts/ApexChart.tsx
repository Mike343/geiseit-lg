"use client";

import dynamic from "next/dynamic";
import type { Props } from "react-apexcharts";
import { ChartSkeleton } from "@/components/ui/Skeleton";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <ChartSkeleton />
});

export function ApexChart(props: Props) {
  return <ReactApexChart {...props} />;
}
