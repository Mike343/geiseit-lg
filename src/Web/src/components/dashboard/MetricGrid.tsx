"use client";

import { Gauge, Globe2, Network, ServerCog, Timer, Waypoints, type LucideIcon } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import type { ApiQuery } from "@/hooks/useApiQuery";
import type { PerformanceResponse, ServiceComponent, StatusResponse } from "@/lib/api/types";
import { formatMs, formatPercent, formatWindow } from "@/lib/format";
import { findComponent, toDisplayStatus } from "@/lib/statusView";
import { STATUS_LABEL, toneForStatus, type DisplayStatus, type Tone } from "@/lib/tones";
import { StatusIcon } from "@/components/ui/StatusIcon";

interface StatusMetric {
  label: string;
  icon: LucideIcon;
  component: ServiceComponent | undefined;
  loading: boolean;
  labels?: Partial<Record<DisplayStatus, string>>;
  captions?: Partial<Record<DisplayStatus, string>>;
}

function StatusMetricCard({ label, icon: Icon, component, loading, labels, captions }: StatusMetric) {
  const status = toDisplayStatus(component?.status);
  const tone: Tone = toneForStatus(status);
  const value = labels?.[status] ?? STATUS_LABEL[status];
  const caption = component?.detail ?? captions?.[status] ?? (component ? undefined : "No data from the status service");
  return (
    <MetricCard
      label={label}
      icon={<Icon className="size-[1.125rem]" />}
      loading={loading}
      tone={tone}
      value={
        <>
          <StatusIcon status={status} className="size-6" />
          {value}
        </>
      }
      caption={caption}
    />
  );
}

export function MetricGrid({ status, performance }: { status: ApiQuery<StatusResponse>; performance: ApiQuery<PerformanceResponse> }) {
  const statusLoading = status.loading;
  const perfLoading = performance.loading;
  const perf = performance.data;

  return (
    <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatusMetricCard
        label="Looking Glass"
        icon={ServerCog}
        component={findComponent(status.data, "web")}
        loading={statusLoading}
        labels={{ operational: "Online" }}
        captions={{ operational: "All systems operational" }}
      />
      <StatusMetricCard
        label="IPv4"
        icon={Globe2}
        component={findComponent(status.data, "ipv4")}
        loading={statusLoading}
        labels={{ operational: "Online" }}
        captions={{ operational: "Connectivity available" }}
      />
      <StatusMetricCard
        label="IPv6"
        icon={Network}
        component={findComponent(status.data, "ipv6")}
        loading={statusLoading}
        labels={{ operational: "Online" }}
        captions={{ operational: "Connectivity available" }}
      />
      <StatusMetricCard
        label="BGP"
        icon={Waypoints}
        component={findComponent(status.data, "bgp")}
        loading={statusLoading}
        labels={{ operational: "Connected", notConfigured: "Not configured" }}
        captions={{ notConfigured: "BGP is not enabled on this Looking Glass." }}
      />
      <MetricCard
        label="Latency"
        icon={<Timer className="size-[1.125rem]" />}
        loading={perfLoading}
        value={perf ? formatMs(perf.avgLatencyMs) : "Unavailable"}
        caption={perf ? (perf.avgLatencyMs === null ? "No successful probes yet" : "Average external latency") : "Performance data can't be loaded"}
      />
      <MetricCard
        label="Uptime"
        icon={<Gauge className="size-[1.125rem]" />}
        loading={perfLoading}
        value={perf ? formatPercent(perf.uptimePercent, 2) : "Unavailable"}
        caption={perf ? formatWindow(perf.windowSeconds) : "Performance data can't be loaded"}
      />
    </section>
  );
}
