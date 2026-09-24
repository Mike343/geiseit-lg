"use client";

import { ResultArea } from "@/components/diagnostics/ResultArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useDiagnostic } from "@/hooks/useDiagnostic";
import { useServiceStatus } from "@/hooks/useServiceStatus";
import { api } from "@/lib/api/browser";
import type { DashboardData } from "@/lib/server/loaders";
import { ActivityCard } from "./ActivityCard";
import { LatencyCard } from "./LatencyCard";
import { MetricGrid } from "./MetricGrid";
import { NetworkCard } from "./NetworkCard";
import { QuickDiagnostic } from "./QuickDiagnostic";
import { StatusHero } from "./StatusHero";

const NETWORK_REFRESH_MS = 300_000;
const PERFORMANCE_REFRESH_MS = 60_000;
const ACTIVITY_REFRESH_MS = 30_000;

export function DashboardView({ initial }: { initial: Pick<DashboardData, "network" | "performance" | "activity"> }) {
  const status = useServiceStatus();
  const network = useApiQuery((signal) => api.getNetwork(signal), { initial: initial.network, intervalMs: NETWORK_REFRESH_MS });
  const performance = useApiQuery((signal) => api.getPerformance(signal), { initial: initial.performance, intervalMs: PERFORMANCE_REFRESH_MS });
  const activity = useApiQuery((signal) => api.getActivity(signal), { initial: initial.activity, intervalMs: ACTIVITY_REFRESH_MS });
  const diag = useDiagnostic();
  const showResults = diag.status !== "idle";

  return (
    <>
      <PageHeader title="Network overview" description="Live status of the GeiseIT Network Looking Glass, with quick diagnostics you can run from our network." />
      <div className="space-y-6">
        <StatusHero status={status} network={network} />
        <MetricGrid status={status} performance={performance} />

        <div className="grid items-start gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <QuickDiagnostic diag={diag} />
          </div>
          <NetworkCard network={network} />
        </div>

        {showResults && (
          <div aria-label="Diagnostic result">
            <ResultArea diag={diag} />
          </div>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <LatencyCard performance={performance} />
          </div>
          <ActivityCard activity={activity} />
        </div>
      </div>
    </>
  );
}
