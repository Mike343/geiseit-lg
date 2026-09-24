"use client";

import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LocalTime } from "@/components/ui/LocalTime";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { STATUS_REFRESH_MS, useServiceStatus } from "@/hooks/useServiceStatus";
import { cn } from "@/lib/cn";
import { formatMs } from "@/lib/format";
import { describeOverall, toDisplayStatus } from "@/lib/statusView";
import { TONE_BADGE, toneForStatus } from "@/lib/tones";
import { StatusIcon } from "@/components/ui/StatusIcon";

export function StatusView() {
  const { data, error, loading, refreshing, refresh, updatedAt } = useServiceStatus();
  const overall = describeOverall(data);
  const tone = toneForStatus(overall.status);
  const checked = data?.checkedAt ?? updatedAt;

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Service status"
        description={`Health of each component, checked live. This page refreshes every ${STATUS_REFRESH_MS / 1000} seconds.`}
        actions={
          <>
            {checked && (
              <span className="text-fg-3 hidden text-xs sm:inline">
                Last checked <LocalTime iso={checked} mode="time" />
              </span>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw aria-hidden="true" className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} />
              Refresh
            </button>
          </>
        }
      />

      {loading && (
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading service status</span>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )}

      {!data && !loading && (
        <ErrorState
          title="Service status is unavailable"
          message="The status service can't be reached right now. This page will keep retrying automatically."
          error={error}
          onRetry={refresh}
        />
      )}

      {data && (
        <div className="space-y-6">
          {error && (
            <ErrorState
              tone="warning"
              title="Showing the last known status"
              message="The latest refresh failed, so the information below may be out of date."
              error={error}
              onRetry={refresh}
            />
          )}
          <Card padded={false} className={cn("flex items-center gap-4 border p-5 sm:p-6", TONE_BADGE[tone])}>
            <StatusIcon status={overall.status} className="size-9 shrink-0" />
            <div>
              <p className="text-fg text-xl font-semibold">{overall.headline === "Online" ? "All systems operational" : overall.headline}</p>
              <p className="text-fg-2 text-sm">{overall.status === "operational" ? "Every required component is healthy. Components that are not configured are not counted." : overall.detail}</p>
            </div>
          </Card>

          <Card as="section" padded={false} aria-label="Components">
            <ul className="divide-line divide-y">
              {data.components.map((component) => {
                const status = toDisplayStatus(component.status);
                return (
                  <li key={component.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <h2 className="text-fg text-[0.9375rem] font-semibold">{component.name}</h2>
                      {component.detail && <p className="text-fg-3 text-[0.8125rem]">{component.detail}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      {component.latencyMs !== null && <span className="text-fg-2 text-[0.8125rem] tabular-nums">{formatMs(component.latencyMs)}</span>}
                      <StatusBadge status={status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="text-fg-3 text-xs">Version {data.version}</p>
        </div>
      )}
    </>
  );
}
