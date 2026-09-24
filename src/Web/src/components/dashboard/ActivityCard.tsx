"use client";

import { Activity, Globe, History, Route, Waypoints, type LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LocalTime } from "@/components/ui/LocalTime";
import { LoadingState } from "@/components/ui/Skeleton";
import type { ApiQuery } from "@/hooks/useApiQuery";
import type { ActivityResponse, DiagnosticKind } from "@/lib/api/types";
import { KIND_LABEL } from "@/lib/diagnosticRequest";

const ICONS: Record<DiagnosticKind, LucideIcon> = { ping: Activity, traceroute: Route, mtr: Waypoints, dns: Globe };

export function ActivityCard({ activity }: { activity: ApiQuery<ActivityResponse> }) {
  const data = activity.data;

  return (
    <Card as="section" aria-labelledby="activity-card-title">
      <CardHeader
        titleId="activity-card-title"
        title="Recent activity"
        description="Anonymous, recent diagnostics"
        icon={<History className="size-[1.125rem]" />}
      />
      {data && data.enabled && data.items.length > 0 ? (
        <ul className="divide-line -my-1 divide-y">
          {data.items.slice(0, 8).map((item, index) => {
            const Icon = ICONS[item.type];
            return (
              <li key={`${item.at}-${index}`} className="flex items-start gap-3 py-3">
                <span aria-hidden="true" className="bg-subtle text-fg-2 mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-fg flex items-baseline justify-between gap-2 text-sm font-semibold">
                    <span className="truncate">
                      {KIND_LABEL[item.type]} <span className="text-fg-2 font-mono text-[0.8125rem] font-medium">{item.target}</span>
                    </span>
                  </p>
                  <p className="text-fg-3 flex flex-wrap justify-between gap-x-2 text-xs">
                    <span>{item.summary}</span>
                    <LocalTime iso={item.at} mode="relative" />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : activity.loading ? (
        <LoadingState label="Loading recent activity" lines={4} />
      ) : data && !data.enabled ? (
        <p className="text-fg-3 text-sm">Recent activity isn&apos;t shown on this Looking Glass.</p>
      ) : data ? (
        <EmptyState compact icon={<History className="size-5" />} title="No recent diagnostics yet" description="Run a test and it will show up here for other visitors." />
      ) : (
        <p className="text-fg-3 text-sm">Recent activity is unavailable right now.</p>
      )}
    </Card>
  );
}
