"use client";

import { useId, useState } from "react";
import { FileJson, FileText, FlaskConical, Maximize2, ScrollText, LayoutList } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { LocalTime } from "@/components/ui/LocalTime";
import { Overlay } from "@/components/ui/Overlay";
import { TerminalOutput } from "@/components/ui/TerminalOutput";
import { Tabs, tabIds, type TabItem } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import type { DiagnosticResult } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { downloadText } from "@/lib/clipboard";
import { KIND_LABEL } from "@/lib/diagnosticRequest";
import { formatDuration } from "@/lib/format";
import { DnsSummary, MtrSummary, PingSummary, TracerouteSummary } from "./ResultSummaries";

const TABS: TabItem[] = [
  { id: "summary", label: "Summary", icon: <LayoutList aria-hidden="true" className="size-4" /> },
  { id: "technical", label: "Technical", icon: <ScrollText aria-hidden="true" className="size-4" /> }
];

export function resultTitle(result: DiagnosticResult): string {
  return result.type === "dns"
    ? `${result.recordType} lookup for ${result.name}`
    : `${KIND_LABEL[result.type]} to ${result.destination}`;
}

export function resultFilename(result: DiagnosticResult, extension: "txt" | "json"): string {
  const target = (result.type === "dns" ? result.name : result.destination).replace(/[^a-z0-9.-]+/gi, "_");
  const stamp = result.startedAt.replace(/[^0-9]/g, "").slice(0, 14);
  return `${result.type}-${target}-${stamp}.${extension}`;
}

function SummaryBody({ result }: { result: DiagnosticResult }) {
  switch (result.type) {
    case "ping":
      return <PingSummary result={result} />;
    case "traceroute":
      return <TracerouteSummary result={result} />;
    case "mtr":
      return <MtrSummary result={result} />;
    case "dns":
      return <DnsSummary result={result} />;
  }
}

function ResultContent({ result, onFullscreen }: { result: DiagnosticResult; onFullscreen?: () => void }) {
  const [tab, setTab] = useState("summary");
  const prefix = useId();
  const { toast } = useToast();
  const simulated = "simulated" in result && result.simulated === true;
  const address = result.type === "dns" ? null : result.resolvedAddress;

  const download = (extension: "txt" | "json") => {
    if (extension === "txt") downloadText(resultFilename(result, "txt"), result.technicalOutput);
    else downloadText(resultFilename(result, "json"), JSON.stringify(result, null, 2), "application/json");
    toast(`Download started (.${extension})`, "info");
  };

  return (
    <section aria-label={`${resultTitle(result)} result`} className="card animate-slide-up overflow-hidden">
      {simulated && (
        <div role="note" className="bg-warning-soft border-warning-line text-warning flex items-start gap-2.5 border-b px-5 py-2.5 text-sm">
          <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-semibold">Simulated data.</strong>{" "}
            <span className="text-fg-2">This result was generated for demonstration and does not reflect real network measurements.</span>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h3 className="text-fg text-lg leading-6 font-semibold break-all">{resultTitle(result)}</h3>
          <p className="text-fg-3 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem]">
            {address && <span className="text-fg-2 font-mono">{address}</span>}
            {result.type !== "dns" && <span>{result.family === "ipv6" ? "IPv6" : "IPv4"}</span>}
            <span>Completed in {formatDuration(result.durationMs)}</span>
            <LocalTime iso={result.startedAt} />
          </p>
          <p className="text-fg-3 mt-1 text-xs">
            Request ID <code className="text-fg-2 font-mono break-all">{result.requestId}</code>
          </p>
        </div>

        <div role="toolbar" aria-label="Result actions" className="flex flex-wrap items-center gap-2">
          <CopyButton text={result.technicalOutput} label="Copy output" copiedLabel="Copied" toastMessage="Technical output copied" size="sm" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => download("txt")}>
            <FileText aria-hidden="true" className="size-4" />
            <span>
              <span className="sr-only">Download output as </span>.txt
            </span>
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => download("json")}>
            <FileJson aria-hidden="true" className="size-4" />
            <span>
              <span className="sr-only">Download result as </span>.json
            </span>
          </button>
          {onFullscreen && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onFullscreen}>
              <Maximize2 aria-hidden="true" className="size-4" />
              Full screen
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pt-5 sm:px-6">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Result view" idPrefix={prefix} />
      </div>

      {TABS.map((item) => {
        if (item.id !== tab) return null;
        const ids = tabIds(prefix, item.id);
        return (
          <div key={item.id} role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className={cn("px-5 pt-5 pb-5 outline-offset-[-2px] sm:px-6 sm:pb-6")}>
            {item.id === "summary" ? <SummaryBody result={result} /> : <TerminalOutput output={result.technicalOutput} />}
          </div>
        );
      })}
    </section>
  );
}

export function ResultPanel({ result }: { result: DiagnosticResult }) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <>
      <ResultContent result={result} onFullscreen={() => setFullscreen(true)} />
      <Overlay open={fullscreen} onClose={() => setFullscreen(false)} title={`${resultTitle(result)} (full screen)`} variant="modal" closeLabel="Close full screen">
        <div className="mx-auto max-w-[84rem] p-3 sm:p-6">
          <ResultContent result={result} />
        </div>
      </Overlay>
    </>
  );
}
