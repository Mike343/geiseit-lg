import type { DiagnosticKind, DiagnosticRequest, DnsRecordType, IpFamily } from "@/lib/api/types";
import { validateDestination, parseIPv4, parseIPv6 } from "@/lib/validation";

export type BuildResult = { ok: true; request: DiagnosticRequest } | { ok: false; message: string };

export const KIND_LABEL: Record<DiagnosticKind, string> = {
  ping: "Ping",
  traceroute: "Traceroute",
  mtr: "MTR",
  dns: "DNS lookup"
};

export const KIND_NOUN: Record<DiagnosticKind, string> = {
  ping: "ping",
  traceroute: "traceroute",
  mtr: "MTR",
  dns: "DNS lookup"
};

export function isIpLiteral(value: string): boolean {
  return parseIPv4(value) !== null || parseIPv6(value) !== null;
}

export function buildRequest(
  kind: DiagnosticKind,
  rawValue: string,
  options: { family?: IpFamily; recordType?: DnsRecordType } = {}
): BuildResult {
  if (kind === "dns") {
    const validation = validateDestination(rawValue, { subject: "domain name or IP address", allowUnderscore: true });
    if (!validation.ok) return { ok: false, message: validation.message };
    const recordType = options.recordType ?? (validation.kind === "hostname" ? "A" : "PTR");
    return { ok: true, request: { name: validation.value, recordType } };
  }

  const family = options.family ?? "auto";
  const validation = validateDestination(rawValue, { family });
  if (!validation.ok) return { ok: false, message: validation.message };
  return { ok: true, request: { destination: validation.value, family } };
}
