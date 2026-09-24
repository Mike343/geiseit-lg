"use client";

import { useId, useRef, useState } from "react";
import { Network, Search, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { DataTable } from "@/components/ui/NetworkTable";
import { LoadingState } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";
import { api } from "@/lib/api/browser";
import { isAbortError, toPlainError, type PlainApiError } from "@/lib/api/errors";
import { parseIPv4, parseIPv6 } from "@/lib/validation";

export function BgpUnavailable() {
  return (
    <EmptyState
      icon={<Network className="size-6" />}
      title="BGP information is currently unavailable"
      description="The Looking Glass is still operational. BGP data is an optional feature and will appear here when it is enabled."
    />
  );
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export function BgpData({ data }: { data: unknown }) {
  const rows = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.items) ? data.items : null;

  if (rows && rows.length > 0 && rows.every(isRecord)) {
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return (
      <DataTable caption="BGP data" head={keys}>
        {rows.map((row, index) => (
          <tr key={index} className="hover:bg-subtle">
            {keys.map((key) => (
              <td key={key} className="px-3.5 py-2.5 font-mono text-xs break-all">
                {cellText((row as Record<string, unknown>)[key])}
              </td>
            ))}
          </tr>
        ))}
      </DataTable>
    );
  }

  if (rows && rows.length === 0) {
    return <EmptyState compact title="No results" description="The BGP service returned no entries." />;
  }

  if (isRecord(data)) {
    return (
      <dl className="divide-line divide-y">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
            <dt className="text-fg-3 text-[0.8125rem] font-medium">{key}</dt>
            <dd className="text-fg min-w-0 font-mono text-xs break-all">{cellText(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <pre className="bg-term text-term-fg overflow-auto rounded-xl p-4 font-mono text-xs">{JSON.stringify(data, null, 2)}</pre>
  );
}

function BgpOutcome({ error, data, onRetry }: { error: PlainApiError | null; data: unknown; onRetry: () => void }) {
  if (error?.code === "bgp_unavailable") return <BgpUnavailable />;
  if (error) {
    return (
      <ErrorState
        title="BGP data could not be loaded"
        message="The request failed. The rest of the Looking Glass is unaffected."
        error={error}
        onRetry={onRetry}
      />
    );
  }
  return <BgpData data={data} />;
}

interface BgpViewProps {
  mode: "routes" | "sessions";
}

export function BgpView({ mode }: BgpViewProps) {
  const query = useApiQuery((signal) => api.getBgp(mode, signal));
  const title = mode === "routes" ? "Current routes" : "Peer sessions";

  return (
    <Card as="section" aria-labelledby="bgp-title">
      <CardHeader titleId="bgp-title" title={title} icon={<Network className="size-[1.125rem]" />} description="Read-only view. Visitors cannot change BGP configuration." />
      {query.loading ? (
        <LoadingState label="Loading BGP data" lines={4} />
      ) : (
        <BgpOutcome error={query.error} data={query.data} onRetry={query.refresh} />
      )}
    </Card>
  );
}

export type BgpQuery = { kind: "asn"; value: string } | { kind: "prefix"; value: string };

export function parseBgpQuery(raw: string): { ok: true; query: BgpQuery } | { ok: false; message: string } {
  const input = raw.trim();
  if (input === "") return { ok: false, message: "Enter a prefix such as 8.8.8.0/24, or an ASN such as AS15169." };

  const asn = /^(?:AS)?(\d{1,10})$/i.exec(input);
  if (asn?.[1]) {
    const n = Number(asn[1]);
    if (n < 1 || n > 4294967295) return { ok: false, message: "That ASN is out of range." };
    return { ok: true, query: { kind: "asn", value: String(n) } };
  }

  const [address = "", length, ...extra] = input.split("/");
  if (extra.length > 0) return { ok: false, message: "That doesn't look like a valid prefix or ASN." };
  const v4 = parseIPv4(address);
  const v6 = v4 ? null : parseIPv6(address);
  if (!v4 && !v6) return { ok: false, message: "That doesn't look like a valid prefix or ASN. Try 8.8.8.0/24, 2001:db8::/32 or AS15169." };
  if (length !== undefined) {
    const max = v4 ? 32 : 128;
    if (!/^\d{1,3}$/.test(length) || Number(length) > max) {
      return { ok: false, message: `The prefix length must be between 0 and ${max}.` };
    }
  }
  return { ok: true, query: { kind: "prefix", value: input } };
}

export function BgpLookup() {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [state, setState] = useState<{ status: "idle" | "loading" | "done"; data?: unknown; error?: PlainApiError | null; query?: BgpQuery }>({ status: "idle" });

  const run = async (query: BgpQuery) => {
    setState({ status: "loading", query });
    try {
      const path = query.kind === "asn" ? `asn/${query.value}` : `prefix/${encodeURIComponent(query.value)}`;
      const data = await api.getBgp(path);
      setState({ status: "done", data, error: null, query });
    } catch (caught) {
      if (isAbortError(caught)) return;
      setState({ status: "done", error: toPlainError(caught), query });
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseBgpQuery(value);
    if (!parsed.ok) {
      setValidation(parsed.message);
      inputRef.current?.focus();
      return;
    }
    setValidation(null);
    void run(parsed.query);
  };

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor={`${uid}-q`} className="text-fg mb-1.5 block text-sm font-semibold">
              Prefix or ASN
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                ref={inputRef}
                id={`${uid}-q`}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={value}
                placeholder="8.8.8.0/24 or AS15169"
                aria-invalid={validation !== null}
                aria-describedby={validation ? `${uid}-err` : undefined}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (validation) setValidation(null);
                }}
                className="field font-mono text-sm sm:flex-1"
              />
              <button type="submit" className="btn btn-primary" disabled={state.status === "loading"}>
                <Search aria-hidden="true" className="size-4" />
                {state.status === "loading" ? "Looking up…" : "Look up"}
              </button>
            </div>
            <div id={`${uid}-err`} aria-live="polite">
              {validation && (
                <p className="text-danger mt-2 flex items-start gap-2 text-sm font-medium">
                  <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>{validation}</span>
                </p>
              )}
            </div>
          </div>
        </form>
      </Card>

      {state.status === "idle" && (
        <div className="border-line-strong rounded-2xl border border-dashed">
          <EmptyState icon={<Search className="size-6" />} title="No lookup yet" description="Enter a prefix or an ASN above to see what the Looking Glass knows about it." />
        </div>
      )}
      {state.status === "loading" && (
        <Card>
          <LoadingState label="Looking up BGP data" lines={4} />
        </Card>
      )}
      {state.status === "done" && (
        <Card as="section" aria-label="Lookup result">
          <BgpOutcome error={state.error ?? null} data={state.data} onRetry={() => state.query && void run(state.query)} />
        </Card>
      )}
    </div>
  );
}
