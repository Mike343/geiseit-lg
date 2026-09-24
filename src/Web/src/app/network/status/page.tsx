import type { Metadata } from "next";
import { ConnectivityView } from "@/components/pages/ConnectivityView";
import { loadPerformance } from "@/lib/server/loaders";

export const metadata: Metadata = {
  title: "Looking Glass status",
  description: "IPv4 and IPv6 connectivity, latency and uptime of the GeiseIT Looking Glass."
};

export default async function Page() {
  return <ConnectivityView initial={await loadPerformance()} />;
}
