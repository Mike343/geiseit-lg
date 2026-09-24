import { PageHeader } from "@/components/layout/PageHeader";
import type { DiagnosticKind } from "@/lib/api/types";
import { DiagnosticRunner } from "./DiagnosticRunner";

export const DIAGNOSTIC_PAGES: Record<DiagnosticKind, { title: string; description: string }> = {
  ping: {
    title: "Ping",
    description: "Send echo requests from the GeiseIT network and measure reachability, round-trip latency and packet loss."
  },
  traceroute: {
    title: "Traceroute",
    description: "See the path packets take from the GeiseIT network to a destination, hop by hop."
  },
  mtr: {
    title: "MTR",
    description: "Combine traceroute and ping to find where latency or packet loss appears along a route."
  },
  dns: {
    title: "DNS lookup",
    description: "Query public DNS records for a name, or run a reverse lookup on an IP address."
  }
};

export function DiagnosticPage({ kind }: { kind: DiagnosticKind }) {
  const page = DIAGNOSTIC_PAGES[kind];
  return (
    <>
      <PageHeader eyebrow="Diagnostics" title={page.title} description={page.description} />
      <DiagnosticRunner kind={kind} />
    </>
  );
}
