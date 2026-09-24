import type { Metadata } from "next";
import { TrafficView } from "@/components/pages/TrafficView";
import { loadTraffic } from "@/lib/server/loaders";
import { parseTrafficRange } from "@/lib/traffic";

export const metadata: Metadata = {
  title: "Traffic",
  description: "Bandwidth across the GeiseIT cluster, internet link and web traffic served."
};

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseTrafficRange((await searchParams).range);
  return <TrafficView initial={await loadTraffic(range)} initialRange={range} />;
}
