"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Play, Timer, X } from "lucide-react";
import { DNS_RECORD_TYPES, type DiagnosticKind, type DiagnosticRequest, type DnsRecordType, type IpFamily } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { buildRequest, KIND_LABEL, KIND_NOUN } from "@/lib/diagnosticRequest";

interface DiagnosticFormProps {
  kind: DiagnosticKind;
  running: boolean;
  cooldownSeconds: number;
  serverRejected?: boolean;
  onSubmit: (kind: DiagnosticKind, request: DiagnosticRequest) => void;
  onCancel: () => void;
}

const EXAMPLES: Record<DiagnosticKind, string[]> = {
  ping: ["8.8.8.8", "1.1.1.1", "cloudflare.com"],
  traceroute: ["8.8.8.8", "cloudflare.com", "2606:4700:4700::1111"],
  mtr: ["1.1.1.1", "google.com"],
  dns: ["example.com", "geiseit.com", "8.8.8.8"]
};

const FAMILIES: { value: IpFamily; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ipv4", label: "IPv4" },
  { value: "ipv6", label: "IPv6" }
];

export function DiagnosticForm({ kind, running, cooldownSeconds, serverRejected, onSubmit, onCancel }: DiagnosticFormProps) {
  const isDns = kind === "dns";
  const uid = useId();
  const inputId = `${uid}-destination`;
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState("");
  const [family, setFamily] = useState<IpFamily>("auto");
  const [recordType, setRecordType] = useState<DnsRecordType>("A");
  const [error, setError] = useState<string | null>(null);

  const validate = (nextValue = value, nextFamily = family, nextRecord = recordType) => {
    const built = buildRequest(kind, nextValue, { family: nextFamily, recordType: nextRecord });
    return built.ok ? null : built.message;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (running || cooldownSeconds > 0) return;
    const built = buildRequest(kind, value, { family, recordType });
    if (!built.ok) {
      setError(built.message);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onSubmit(kind, built.request);
  };

  const label = isDns ? "Domain name or IP address" : "Hostname or IP address";
  const cooling = cooldownSeconds > 0;
  const invalid = error !== null || Boolean(serverRejected);

  return (
    <form onSubmit={submit} noValidate aria-label={`${KIND_LABEL[kind]} form`} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label htmlFor={inputId} className="text-fg mb-1.5 block text-sm font-semibold">
            {label}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="destination"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            placeholder={isDns ? "example.com" : "8.8.8.8 or example.com"}
            aria-invalid={invalid}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(validate(event.target.value));
            }}
            onBlur={() => {
              if (value.trim() !== "") setError(validate());
            }}
            className="field font-mono text-sm"
          />
        </div>

        {isDns ? (
          <div>
            <label htmlFor={`${uid}-record`} className="text-fg mb-1.5 block text-sm font-semibold">
              Record type
            </label>
            <select
              id={`${uid}-record`}
              value={recordType}
              onChange={(event) => setRecordType(event.target.value as DnsRecordType)}
              className="field min-w-32 cursor-pointer"
            >
              {DNS_RECORD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <fieldset>
            <legend className="text-fg mb-1.5 text-sm font-semibold">IP version</legend>
            <div className="bg-subtle border-line inline-flex gap-1 rounded-xl border p-1">
              {FAMILIES.map((option) => (
                <label key={option.value} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name={`${uid}-family`}
                    value={option.value}
                    checked={family === option.value}
                    onChange={() => {
                      setFamily(option.value);
                      if (error) setError(validate(value, option.value));
                    }}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "text-fg-2 hover:text-fg peer-checked:bg-surface peer-checked:text-fg peer-checked:shadow-card",
                      "peer-focus-visible:outline-ring inline-flex min-h-9 min-w-16 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div id={errorId} aria-live="polite" className="min-h-0">
        {error && (
          <p className="text-danger flex items-start gap-2 text-sm font-medium">
            <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={running || cooling} aria-disabled={running || cooling}>
          {running ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          ) : cooling ? (
            <Timer aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
          {running ? "Running…" : cooling ? `Try again in ${cooldownSeconds}s` : `Run ${KIND_NOUN[kind]}`}
        </button>
        {running && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            <X aria-hidden="true" className="size-4" />
            Cancel
          </button>
        )}
        <p id={hintId} className="text-fg-3 text-[0.8125rem]">
          Try{" "}
          {EXAMPLES[kind].map((example, index) => (
            <span key={example}>
              {index > 0 && ", "}
              <button
                type="button"
                className="text-brand-fg hover:underline focus-visible:underline rounded font-mono"
                onClick={() => {
                  setValue(example);
                  setError(null);
                  inputRef.current?.focus();
                }}
              >
                {example}
              </button>
            </span>
          ))}
        </p>
      </div>
    </form>
  );
}
