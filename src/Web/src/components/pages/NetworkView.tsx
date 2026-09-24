"use client";

import { RefreshCw, Server, ShieldCheck } from "lucide-react";
import { NetworkInfoRows } from "@/components/pages/NetworkInfoRows";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";
import { api } from "@/lib/api/browser";
import type { LoadResult } from "@/lib/api/result";
import type { NetworkInfo } from "@/lib/api/types";
import { cn } from "@/lib/cn";

export function NetworkView({ initial }: { initial: LoadResult<NetworkInfo> }) {
  const query = useApiQuery((signal) => api.getNetwork(signal), { initial });

  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Network information"
        description="Public details about the network this Looking Glass runs on. All diagnostics originate from here."
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={query.refresh} disabled={query.refreshing}>
            <RefreshCw aria-hidden="true" className={cn("size-4", query.refreshing && "animate-spin motion-reduce:animate-none")} />
            Refresh
          </button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card as="section" aria-labelledby="net-title" className="lg:col-span-2">
          <CardHeader titleId="net-title" title="Looking Glass" icon={<Server className="size-[1.125rem]" />} />
          {query.data ? (
            <NetworkInfoRows info={query.data} full />
          ) : query.loading ? (
            <LoadingState label="Loading network information" lines={7} />
          ) : (
            <ErrorState
              title="Network information is unavailable"
              message="The details can't be loaded right now. The Looking Glass may still be operating normally."
              error={query.error}
              onRetry={query.refresh}
            />
          )}
        </Card>
        <Card as="aside" aria-labelledby="net-privacy">
          <CardHeader titleId="net-privacy" title="What is shown here" icon={<ShieldCheck className="size-[1.125rem]" />} />
          <p className="text-fg-2 text-sm">
            Only intentionally public information is published: the addresses diagnostics originate from, the operator and the location. Internal address
            ranges, node names and management interfaces are never exposed.
          </p>
        </Card>
      </div>
    </>
  );
}
