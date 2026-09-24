"use client";

import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { NetworkInfoRows } from "@/components/pages/NetworkInfoRows";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/Skeleton";
import type { ApiQuery } from "@/hooks/useApiQuery";
import type { NetworkInfo } from "@/lib/api/types";

export function NetworkCard({ network }: { network: ApiQuery<NetworkInfo> }) {
  return (
    <Card as="section" aria-labelledby="network-card-title" className="flex flex-col">
      <CardHeader
        titleId="network-card-title"
        title="Where is this Looking Glass?"
        icon={<MapPin className="size-[1.125rem]" />}
        action={
          <Link href="/network" className="text-brand-fg inline-flex items-center gap-1 text-[0.8125rem] font-semibold hover:underline">
            Details
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        }
      />
      {network.data ? (
        <NetworkInfoRows info={network.data} />
      ) : network.loading ? (
        <LoadingState label="Loading network information" lines={5} />
      ) : (
        <EmptyState compact title="Unavailable" description="Network information can't be loaded right now." />
      )}
    </Card>
  );
}
