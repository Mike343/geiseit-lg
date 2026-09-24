"use client";

import { useId, useRef, useState } from "react";
import { Activity, Globe, Loader2, Route, Timer, Waypoints, X, type LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import type { useDiagnostic } from "@/hooks/useDiagnostic";
import type { DiagnosticKind } from "@/lib/api/types";
import { buildRequest, KIND_LABEL } from "@/lib/diagnosticRequest";

const ACTIONS: { kind: DiagnosticKind; icon: LucideIcon; primary?: boolean }[] = [
  { kind: "ping", icon: Activity, primary: true },
  { kind: "traceroute", icon: Route },
  { kind: "mtr", icon: Waypoints },
  { kind: "dns", icon: Globe }
];

export function QuickDiagnostic({ diag }: { diag: ReturnType<typeof useDiagnostic> }) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = diag.running || diag.coolingDown;

  const start = (kind: DiagnosticKind) => {
    if (busy) return;
    const built = buildRequest(kind, value);
    if (!built.ok) {
      setError(built.message);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    void diag.run(kind, built.request);
  };

  return (
    <Card as="section" aria-labelledby={`${uid}-title`}>
      <CardHeader
        titleId={`${uid}-title`}
        title="Quick diagnostic"
        description="Test connectivity from the GeiseIT network. Results appear below."
      />
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          start("ping");
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor={`${uid}-dest`} className="text-fg mb-1.5 block text-sm font-semibold">
            What would you like to test?
          </label>
          <input
            ref={inputRef}
            id={`${uid}-dest`}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            placeholder="Enter an IP address or hostname, for example 8.8.8.8"
            aria-invalid={error !== null}
            aria-describedby={error ? `${uid}-error` : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            className="field h-12 font-mono text-sm"
          />
          <div id={`${uid}-error`} aria-live="polite">
            {error && (
              <p className="text-danger mt-2 flex items-start gap-2 text-sm font-medium">
                <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {ACTIONS.map(({ kind, icon: Icon, primary }) => (
            <button
              key={kind}
              type="button"
              onClick={() => start(kind)}
              disabled={busy}
              className={`btn ${primary ? "btn-primary" : "btn-secondary"}`}
            >
              <Icon aria-hidden="true" className="size-4" />
              {kind === "dns" ? "DNS" : KIND_LABEL[kind]}
            </button>
          ))}
        </div>

        <div className="flex min-h-6 flex-wrap items-center gap-3 text-[0.8125rem]">
          {diag.running && (
            <>
              <span className="text-fg-2 inline-flex items-center gap-2">
                <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                Running…
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={diag.cancel}>
                <X aria-hidden="true" className="size-4" />
                Cancel
              </button>
            </>
          )}
          {!diag.running && diag.coolingDown && (
            <span className="text-warning inline-flex items-center gap-2 font-medium" aria-live="polite">
              <Timer aria-hidden="true" className="size-4" />
              Rate limit reached. You can run again in {diag.cooldownSeconds}s.
            </span>
          )}
          {!diag.running && !diag.coolingDown && (
            <span className="text-fg-3">Press Enter to ping. Use the Diagnostics pages for IP version and DNS record options.</span>
          )}
        </div>
      </form>
    </Card>
  );
}
