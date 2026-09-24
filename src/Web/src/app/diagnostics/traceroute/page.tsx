import type { Metadata } from "next";
import { DiagnosticPage, DIAGNOSTIC_PAGES } from "@/components/diagnostics/DiagnosticPage";

export const metadata: Metadata = { title: DIAGNOSTIC_PAGES.traceroute.title, description: DIAGNOSTIC_PAGES.traceroute.description };

export default function Page() {
  return <DiagnosticPage kind="traceroute" />;
}
