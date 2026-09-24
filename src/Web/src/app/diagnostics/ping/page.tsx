import type { Metadata } from "next";
import { DiagnosticPage, DIAGNOSTIC_PAGES } from "@/components/diagnostics/DiagnosticPage";

export const metadata: Metadata = { title: DIAGNOSTIC_PAGES.ping.title, description: DIAGNOSTIC_PAGES.ping.description };

export default function Page() {
  return <DiagnosticPage kind="ping" />;
}
