"use client";

import { Globe2, LineChart, Network, RefreshCw, Timer } from "lucide-react";
import { LatencyChart } from "@/components/charts/LatencyChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LocalTime } from "@/components/ui/LocalTime";
import { ChartSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApiQuery } from "@/hooks/useApiQuery";
import { api } from "@/lib/api/browser";
import type { LoadResult } from "@/lib/api/result";
import type { FamilyPerformance, PerformanceResponse } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatMs, formatPercent, formatWindow } from "@/lib/format";

const REFRESH_MS = 60_000;

function FamilyCard({ title, icon, data, window }: { title: string; icon: React.ReactNode; data: FamilyPerformance; window: string }) {
  return (
    <Card as="section" aria-label={`${title} connectivity`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-fg flex items-center gap-2.5 text-base font-semibold">
          <span aria-hidden="true" className="bg-subtle text-fg-2 grid size-9 place-items-center rounded-xl">
            {icon}
          </span>
          {title}
        </h2>
        <StatusBadge status={data.status} />
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-fg-3 text-[0.8125rem]">Average latency</dt>
          <dd className="text-fg mt-0.5 text-2xl font-semibold tabular-nums">{formatMs(data.avgLatencyMs)}</dd>
        </div>
        <div>
          <dt className="text-fg-3 text-[0.8125rem]">Uptime</dt>
          <dd className="text-fg mt-0.5 text-2xl font-semibold tabular-nums">{formatPercent(data.uptimePercent, 2)}</dd>
          <dd className="text-fg-3 text-xs">{window}</dd>
        </div>
      </dl>
    </Card>
  );
}

export function ConnectivityView({ initial }: { initial: LoadResult<PerformanceResponse> }) {
  const query = useApiQuery((signal) => api.getPerformance(signal), { initial, intervalMs: REFRESH_MS });
  const data = query.data;
  const window = data ? formatWindow(data.windowSeconds) : "";

  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Looking Glass status"
        description="Connectivity of this Looking Glass to the Internet, measured continuously by the diagnostics service."
        actions={
          <>
            {query.updatedAt && (
              <span className="text-fg-3 hidden text-xs sm:inline">
                Updated <LocalTime iso={query.updatedAt} mode="time" />
              </span>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={query.refresh} disabled={query.refreshing}>
              <RefreshCw aria-hidden="true" className={cn("size-4", query.refreshing && "animate-spin motion-reduce:animate-none")} />
              Refresh
            </button>
          </>
        }
      />

      {!data && query.loading && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
          <Card>
            <ChartSkeleton />
          </Card>
        </div>
      )}

      {!data && !query.loading && (
        <ErrorState
          title="Connectivity data is unavailable"
          message="The performance measurements can't be loaded right now. The Looking Glass itself may still be operating normally."
          error={query.error}
          onRetry={query.refresh}
        />
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <FamilyCard title="IPv4 connectivity" icon={<Globe2 className="size-[1.125rem]" />} data={data.ipv4} window={window} />
            <FamilyCard title="IPv6 connectivity" icon={<Network className="size-[1.125rem]" />} data={data.ipv6} window={window} />
          </div>

          <Card as="section" aria-labelledby="latency-title">
            <CardHeader
              titleId="latency-title"
              title="Latency over time"
              icon={<LineChart className="size-[1.125rem]" />}
              description={`One probe every ${data.intervalSeconds} seconds. ${window}. Gaps are failed probes.`}
              action={
                <span className="text-fg-2 hidden items-center gap-1.5 text-[0.8125rem] sm:inline-flex">
                  <Timer aria-hidden="true" className="size-4" />
                  Overall {formatMs(data.avgLatencyMs)} · {formatPercent(data.uptimePercent, 2)}
                </span>
              }
            />
            {data.ipv4.samples.length + data.ipv6.samples.length > 0 ? (
              <LatencyChart ipv4={data.ipv4.samples} ipv6={data.ipv6.samples} height={320} />
            ) : (
              <EmptyState compact title="Collecting data" description="Measurements appear here after the first probes complete. This takes about a minute after a restart." />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
