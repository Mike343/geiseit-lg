"use client";

import Link from "next/link";
import { ArrowRight, LineChart } from "lucide-react";
import { LatencyChart } from "@/components/charts/LatencyChart";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChartSkeleton } from "@/components/ui/Skeleton";
import type { ApiQuery } from "@/hooks/useApiQuery";
import type { PerformanceResponse } from "@/lib/api/types";
import { formatWindow } from "@/lib/format";

export function LatencyCard({ performance }: { performance: ApiQuery<PerformanceResponse> }) {
  const data = performance.data;
  return (
    <Card as="section" aria-labelledby="latency-card-title">
      <CardHeader
        titleId="latency-card-title"
        title="Network performance"
        description={data ? `External latency, IPv4 versus IPv6. ${formatWindow(data.windowSeconds)}.` : "External latency, IPv4 versus IPv6"}
        icon={<LineChart className="size-[1.125rem]" />}
        action={
          <Link href="/network/status" className="text-brand-fg inline-flex items-center gap-1 text-[0.8125rem] font-semibold hover:underline">
            Details
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        }
      />
      {data ? (
        <LatencyChart ipv4={data.ipv4.samples} ipv6={data.ipv6.samples} />
      ) : performance.loading ? (
        <ChartSkeleton />
      ) : (
        <EmptyState compact title="Unavailable" description="Latency measurements can't be loaded right now. The rest of the page is unaffected." />
      )}
    </Card>
  );
}
