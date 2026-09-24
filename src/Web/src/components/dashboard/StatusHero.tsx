"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, MapPin, RefreshCw, XCircle, type LucideIcon } from "lucide-react";
import { LocalTime } from "@/components/ui/LocalTime";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ApiQuery } from "@/hooks/useApiQuery";
import type { NetworkInfo, StatusResponse } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { describeOverall } from "@/lib/statusView";
import { TONE_BADGE, TONE_TEXT, toneForStatus, type DisplayStatus } from "@/lib/tones";

const ICONS: Record<DisplayStatus, LucideIcon> = {
  operational: CheckCircle2,
  degraded: AlertTriangle,
  outage: XCircle,
  notConfigured: CircleHelp,
  unavailable: CircleHelp
};

export function StatusHero({ status, network }: { status: ApiQuery<StatusResponse>; network: ApiQuery<NetworkInfo> }) {
  const view = describeOverall(status.data);
  const tone = toneForStatus(view.status);
  const Icon = ICONS[view.status];
  const location = network.data?.location;

  return (
    <section aria-label="Looking Glass status" className="card relative overflow-hidden p-6 sm:p-8">
      <div aria-hidden="true" className={cn("pointer-events-none absolute -top-24 -right-16 size-72 rounded-full opacity-[0.12] blur-3xl", tone === "success" ? "bg-success-solid" : tone === "warning" ? "bg-warning-solid" : tone === "danger" ? "bg-danger-solid" : "bg-brand")} />
      <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <div className="flex items-center gap-4 sm:gap-5">
          <span
            aria-hidden="true"
            className={cn("grid size-14 shrink-0 place-items-center rounded-2xl border sm:size-16", TONE_BADGE[tone])}
          >
            <Icon className="size-7 sm:size-8" />
          </span>
          <div className="min-w-0">
            <p className="text-fg-3 text-[0.8125rem] font-semibold tracking-wide uppercase">Is the Looking Glass online?</p>
            {status.loading ? (
              <div role="status" aria-busy="true" className="mt-1.5 space-y-2">
                <span className="sr-only">Checking status</span>
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : (
              <>
                <p className={cn("text-[2rem] leading-tight font-bold tracking-tight sm:text-4xl", TONE_TEXT[tone])}>
                  {view.headline}
                </p>
                <p className="text-fg-2 mt-0.5 text-[0.9375rem]">{view.detail}</p>
              </>
            )}
          </div>
        </div>

        <dl className="text-[0.8125rem] sm:text-right">
          {location && (
            <div className="flex items-center gap-1.5 sm:justify-end">
              <MapPin aria-hidden="true" className="text-fg-3 size-4" />
              <dt className="sr-only">Location</dt>
              <dd className="text-fg font-semibold">{location}</dd>
            </div>
          )}
          {status.data && (
            <div className="text-fg-3 mt-1 flex items-center gap-1.5 sm:justify-end">
              <RefreshCw aria-hidden="true" className={cn("size-3.5", status.refreshing && "animate-spin motion-reduce:animate-none")} />
              <dt>Last checked</dt>
              <dd>
                <LocalTime iso={status.data.checkedAt} mode="time" />
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
