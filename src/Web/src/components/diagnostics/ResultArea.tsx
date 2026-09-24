"use client";

import { useEffect, useState } from "react";
import { Ban, Terminal, Timer } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import type { useDiagnostic } from "@/hooks/useDiagnostic";
import { describeDiagnosticError } from "@/lib/errorCopy";
import { KIND_NOUN } from "@/lib/diagnosticRequest";
import { ResultPanel, resultTitle } from "./ResultPanel";

type DiagnosticController = ReturnType<typeof useDiagnostic>;

const SLOW_HINT: Record<string, string> = {
  "DNS lookup": "A DNS lookup is usually instant.",
  MTR: "MTR sends many probes and can take 10 to 30 seconds.",
  ping: "A ping usually takes a few seconds.",
  traceroute: "A traceroute can take up to 30 seconds.",
};

function RunningPanel({ kind, target }: { kind: string; target: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="card overflow-hidden" role="status" aria-live="polite">
      <div className="bg-line relative h-1 overflow-hidden">
        <div className="animate-indeterminate bg-brand absolute inset-y-0 left-0 w-1/3 rounded-full motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />
      </div>
      <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <span aria-hidden="true" className="bg-brand-soft text-brand-fg grid size-11 place-items-center rounded-xl">
          <Terminal className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg font-semibold break-all">
            Running {kind} to {target}
          </p>
          <p className="text-fg-3 text-[0.8125rem]">{SLOW_HINT[kind] ?? ""} Results appear here as soon as they are ready.</p>
        </div>
        <span aria-hidden="true" className="text-fg-3 font-mono text-sm tabular-nums">
          {elapsed}s
        </span>
      </div>
    </div>
  );
}

export function ResultArea({ diag }: { diag: DiagnosticController }) {
  const { status, kind, request, result, error, cooldownSeconds, coolingDown } = diag;

  if (status === "idle") {
    return (
      <div className="border-line-strong rounded-2xl border border-dashed">
        <EmptyState
          icon={<Terminal className="size-6" />}
          title="No diagnostic results yet"
          description="Enter a hostname or IP address above to begin."
        />
      </div>
    );
  }

  if (status === "running" && kind && request) {
    const target = "destination" in request ? request.destination : request.name;
    return <RunningPanel kind={KIND_NOUN[kind]} target={target} />;
  }

  if (status === "cancelled") {
    return (
      <div className="border-line-strong rounded-2xl border border-dashed">
        <EmptyState
          icon={<Ban className="size-6" />}
          title="Diagnostic cancelled"
          description="The run was stopped and the underlying process was terminated. No result was recorded."
        />
      </div>
    );
  }

  if (status === "error" && error) {
    const copy = describeDiagnosticError(error, kind);
    const isLimit = error.code === "rate_limited" || error.code === "busy";
    return (
      <ErrorState
        title={copy.title}
        message={copy.message}
        error={error}
        tone={copy.tone}
        icon={isLimit ? <Timer className="size-5" /> : undefined}
        onRetry={copy.retryable && kind && request ? () => void diag.run(kind, request) : undefined}
        retryDisabled={coolingDown}
        retryLabel="Retry"
      >
        {isLimit && cooldownSeconds > 0 && (
          <p aria-live="polite" className="text-fg text-sm font-medium tabular-nums">
            You can run another diagnostic in {cooldownSeconds} {cooldownSeconds === 1 ? "second" : "seconds"}.
          </p>
        )}
      </ErrorState>
    );
  }

  if (status === "success" && result) {
    return (
      <>
        <p role="status" className="sr-only">
          {resultTitle(result)} completed. Results are shown below.
        </p>
        <ResultPanel result={result} />
      </>
    );
  }

  return null;
}
