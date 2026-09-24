"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Download, Globe, Info, LineChart, RefreshCw, Server, Upload } from "lucide-react";
import { TrafficChart } from "@/components/charts/TrafficChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LocalTime } from "@/components/ui/LocalTime";
import { MetricCard } from "@/components/ui/MetricCard";
import { ChartSkeleton } from "@/components/ui/Skeleton";
import { Tabs, tabIds } from "@/components/ui/Tabs";
import { useApiQuery } from "@/hooks/useApiQuery";
import { api } from "@/lib/api/browser";
import type { LoadResult } from "@/lib/api/result";
import type { TrafficRange, TrafficResponse } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatBitRate, nodeUtilisationLabel, TRAFFIC_RANGES } from "@/lib/traffic";

const REFRESH_MS = 30_000;
const RANGE_TABS = TRAFFIC_RANGES.map(({ id, label }) => ({ id, label }));
const ID_PREFIX = "traffic-range";
const CLUSTER_HEIGHT = 320;
const NODE_HEIGHT = 180;
const SOURCE_HEIGHT = 260;

const NotConnected = () => <span className="text-fg-3 text-base font-medium">Not connected</span>;

function Metrics({ data }: { data?: TrafficResponse }) {
  const loading = !data;
  const current = data?.current;
  const internet = data?.internet.available ?? true;
  const web = data?.web.available ?? true;
  const internetNote = "Internet link counters aren't connected yet.";
  const webNote = "Ingress metrics aren't being collected yet.";
  const icon = "size-[1.125rem]";

  return (
    <section aria-label="Current bandwidth" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard loading={loading} label="Cluster inbound" icon={<ArrowDownToLine className={icon} />} value={formatBitRate(current?.clusterRxBps)} caption="All traffic received by the nodes" />
      <MetricCard loading={loading} label="Cluster outbound" icon={<ArrowUpFromLine className={icon} />} value={formatBitRate(current?.clusterTxBps)} caption="All traffic sent by the nodes" />
      <MetricCard
        loading={loading}
        label="Internet inbound (download)"
        icon={<Download className={icon} />}
        value={internet ? formatBitRate(current?.internetRxBps) : <NotConnected />}
        caption={internet ? "Received on the site's internet link" : internetNote}
      />
      <MetricCard
        loading={loading}
        label="Internet outbound (upload)"
        icon={<Upload className={icon} />}
        value={internet ? formatBitRate(current?.internetTxBps) : <NotConnected />}
        caption={internet ? "Sent on the site's internet link" : internetNote}
      />
      <MetricCard
        loading={loading}
        label="Web served in"
        icon={<Globe className={icon} />}
        value={web ? formatBitRate(current?.webInBps) : <NotConnected />}
        caption={web ? "Requests received through the ingress" : webNote}
      />
      <MetricCard
        loading={loading}
        label="Web served out"
        icon={<Globe className={icon} />}
        value={web ? formatBitRate(current?.webOutBps) : <NotConnected />}
        caption={web ? "Responses sent through the ingress" : webNote}
      />
    </section>
  );
}

function ChartCardSkeleton({ height, title }: { height: number; title: string }) {
  return (
    <Card>
      <p className="text-fg mb-4 text-base font-semibold">{title}</p>
      <div style={{ height: height + 40 }}>
        <ChartSkeleton className="h-full" />
      </div>
    </Card>
  );
}

function Skeletons() {
  return (
    <div className="space-y-6">
      <ChartCardSkeleton title="Cluster network" height={CLUSTER_HEIGHT} />
      <ChartCardSkeleton title="Per node" height={NODE_HEIGHT} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCardSkeleton title="Internet link" height={SOURCE_HEIGHT} />
        <ChartCardSkeleton title="Web traffic served" height={SOURCE_HEIGHT} />
      </div>
    </div>
  );
}

function TrafficCharts({ data }: { data: TrafficResponse }) {
  return (
    <div className="space-y-6">
      <Card as="section" aria-labelledby="cluster-title">
        <CardHeader
          titleId="cluster-title"
          title="Cluster network"
          icon={<LineChart className="size-[1.125rem]" />}
          description="All traffic on the nodes' network interfaces, internal and external. Solid line: inbound. Dashed line: outbound."
        />
        <TrafficChart label="Cluster network, inbound versus outbound" inLabel="Inbound" outLabel="Outbound" inPoints={data.cluster.rx} outPoints={data.cluster.tx} height={CLUSTER_HEIGHT} />
      </Card>

      <section aria-labelledby="nodes-title">
        <h2 id="nodes-title" className="text-fg mb-3 text-base font-semibold sm:text-[1.0625rem]">
          Per node
        </h2>
        {data.nodes.length === 0 ? (
          <Card>
            <EmptyState compact icon={<Server className="size-6" />} title="No node data yet" description="Per-node bandwidth appears here once the nodes have reported." />
          </Card>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2">
            {data.nodes.map((node) => (
              <li key={node.label}>
                <Card className="h-full">
                  <CardHeader headingLevel={3} title={node.label} description={nodeUtilisationLabel(node) ?? "Capacity not reported"} className="mb-2" />
                  <TrafficChart label={`${node.label}, inbound versus outbound`} inLabel="Inbound" outLabel="Outbound" inPoints={node.rx} outPoints={node.tx} height={NODE_HEIGHT} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card as="section" aria-labelledby="internet-title">
          <CardHeader
            titleId="internet-title"
            title="Internet link"
            icon={<Download className="size-[1.125rem]" />}
            description="The site's internet link. Solid line: inbound (download). Dashed line: outbound (upload)."
          />
          {data.internet.available ? (
            <TrafficChart label="Internet link, download versus upload" inLabel="Inbound (download)" outLabel="Outbound (upload)" inPoints={data.internet.rx} outPoints={data.internet.tx} height={SOURCE_HEIGHT} />
          ) : (
            <EmptyState compact icon={<Download className="size-6" />} title="Internet link not connected" description="The internet link counters aren't connected yet, so there is nothing to draw here." />
          )}
        </Card>

        <Card as="section" aria-labelledby="web-title">
          <CardHeader
            titleId="web-title"
            title="Web traffic served"
            icon={<Globe className="size-[1.125rem]" />}
            description="HTTP served through the ingress. Solid line: request bytes in. Dashed line: response bytes out."
          />
          {data.web.available ? (
            <TrafficChart label="Web traffic, requests in versus responses out" inLabel="Requests in" outLabel="Responses out" inPoints={data.web.in} outPoints={data.web.out} height={SOURCE_HEIGHT} />
          ) : (
            <EmptyState compact icon={<Globe className="size-6" />} title="Web traffic not connected" description="The ingress metrics aren't being collected yet, so there is nothing to draw here." />
          )}
        </Card>
      </div>
    </div>
  );
}

function TrafficPanel({ range, initial }: { range: TrafficRange; initial?: LoadResult<TrafficResponse> }) {
  const query = useApiQuery((signal) => api.getTraffic(range, signal), { initial, intervalMs: REFRESH_MS });
  const data = query.data;
  const ids = tabIds(ID_PREFIX, range);

  return (
    <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} className="mt-6 space-y-6">
      <div className="flex items-center justify-end gap-3">
        {data && query.error && <span className="text-warning text-xs">Couldn&apos;t refresh, showing the last data.</span>}
        {query.updatedAt && (
          <span className="text-fg-3 hidden text-xs sm:inline">
            Updated <LocalTime iso={query.updatedAt} mode="time" />
          </span>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={query.refresh} disabled={query.refreshing}>
          <RefreshCw aria-hidden="true" className={cn("size-4", query.refreshing && "animate-spin motion-reduce:animate-none")} />
          Refresh
        </button>
      </div>

      {!data && !query.loading ? (
        <Card>
          <EmptyState
            icon={<LineChart className="size-6" />}
            title="Traffic data is currently unavailable"
            description="The Looking Glass is still operational."
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={query.refresh} disabled={query.refreshing}>
                Try again
              </button>
            }
          />
        </Card>
      ) : (
        <>
          <Metrics data={data} />
          {data ? <TrafficCharts data={data} /> : <Skeletons />}
        </>
      )}
    </div>
  );
}

export function TrafficView({ initial, initialRange }: { initial: LoadResult<TrafficResponse>; initialRange: TrafficRange }) {
  const [range, setRange] = useState<TrafficRange>(initialRange);
  const [switched, setSwitched] = useState(false);

  const select = (id: string) => {
    const next = TRAFFIC_RANGES.find((r) => r.id === id)?.id;
    if (!next || next === range) return;
    setRange(next);
    setSwitched(true);
    window.history.replaceState(null, "", `${window.location.pathname}?range=${next}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Traffic"
        description="Bandwidth across the cluster, the site's internet link and the web traffic served, measured continuously."
      />

      <Card as="aside" aria-labelledby="how-to-read" className="mb-6">
        <h2 id="how-to-read" className="text-fg mb-2 flex items-center gap-2 text-sm font-semibold">
          <Info aria-hidden="true" className="text-fg-3 size-4" />
          How to read this
        </h2>
        <ul className="text-fg-2 list-disc space-y-1 pl-5 text-[0.8125rem] leading-5">
          <li>Cluster and nodes: all traffic on the nodes&apos; network interfaces, internal and external.</li>
          <li>Internet: the site&apos;s internet link, download is inbound and upload is outbound.</li>
          <li>Web: HTTP served through the ingress, requests in and responses out.</li>
          <li>Values are averages over 30 seconds (1 hour), 2 minutes (6 hours) or 5 minutes (24 hours).</li>
        </ul>
      </Card>

      <Tabs tabs={RANGE_TABS} value={range} onChange={select} label="Time range" idPrefix={ID_PREFIX} />

      <TrafficPanel key={range} range={range} initial={switched ? undefined : initial} />
    </>
  );
}
