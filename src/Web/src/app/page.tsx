import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { loadActivity, loadNetwork, loadPerformance } from "@/lib/server/loaders";

export const metadata: Metadata = {
  title: { absolute: "GeiseIT Network Looking Glass | Live network diagnostics" }
};

export default async function DashboardPage() {
  const [network, performance, activity] = await Promise.all([loadNetwork(), loadPerformance(), loadActivity()]);
  return <DashboardView initial={{ network, performance, activity }} />;
}
