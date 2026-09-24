import type { Metadata } from "next";
import { DiagnosticPage, DIAGNOSTIC_PAGES } from "@/components/diagnostics/DiagnosticPage";

export const metadata: Metadata = { title: DIAGNOSTIC_PAGES.dns.title, description: DIAGNOSTIC_PAGES.dns.description };

export default function Page() {
  return <DiagnosticPage kind="dns" />;
}
