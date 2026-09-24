export type ComponentStatus = "operational" | "degraded" | "outage" | "notConfigured";
export type IpFamily = "auto" | "ipv4" | "ipv6";
export type DiagnosticKind = "ping" | "traceroute" | "mtr" | "dns";
export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "NS" | "TXT" | "SOA" | "PTR";

export const DNS_RECORD_TYPES: DnsRecordType[] = ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "PTR"];

export interface ServiceComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  detail: string | null;
  latencyMs: number | null;
}

export interface StatusResponse {
  overall: ComponentStatus;
  checkedAt: string;
  version: string;
  components: ServiceComponent[];
}

export interface NetworkInfo {
  brand: string;
  location: string;
  hostname: string;
  ipv4: string | null;
  ipv6: string | null;
  asn: string | null;
  network: string;
  platform: string;
  connectivity: string;
  version: string;
}

export interface PerformanceSample {
  at: string;
  latencyMs: number | null;
}

export interface FamilyPerformance {
  status: ComponentStatus;
  avgLatencyMs: number | null;
  uptimePercent: number | null;
  samples: PerformanceSample[];
}

export interface PerformanceResponse {
  generatedAt: string;
  windowSeconds: number;
  intervalSeconds: number;
  avgLatencyMs: number | null;
  uptimePercent: number | null;
  ipv4: FamilyPerformance;
  ipv6: FamilyPerformance;
}

export interface ActivityItem {
  type: DiagnosticKind;
  target: string;
  summary: string;
  at: string;
}

export interface ActivityResponse {
  enabled: boolean;
  items: ActivityItem[];
}

export interface DestinationRequest {
  destination: string;
  family: IpFamily;
}

export interface DnsRequest {
  name: string;
  recordType: DnsRecordType;
}

export type DiagnosticRequest = DestinationRequest | DnsRequest;

interface DiagnosticBase {
  requestId: string;
  startedAt: string;
  durationMs: number;
  technicalOutput: string;
}

interface HostDiagnosticBase extends DiagnosticBase {
  destination: string;
  resolvedAddress: string | null;
  family: "ipv4" | "ipv6";
  simulated: boolean;
}

export interface PingReply {
  seq: number;
  ttl: number | null;
  timeMs: number | null;
}

export interface PingResult extends HostDiagnosticBase {
  type: "ping";
  transmitted: number;
  received: number;
  lossPercent: number;
  minMs: number | null;
  avgMs: number | null;
  maxMs: number | null;
  stdDevMs: number | null;
  replies: PingReply[];
}

export interface TracerouteHop {
  hop: number;
  responded: boolean;
  redacted: boolean;
  address: string | null;
  hostname: string | null;
  rttMs: (number | null)[];
  avgMs: number | null;
}

export interface TracerouteResult extends HostDiagnosticBase {
  type: "traceroute";
  reachedDestination: boolean;
  hops: TracerouteHop[];
}

export interface MtrHop {
  hop: number;
  responded: boolean;
  redacted: boolean;
  address: string | null;
  hostname: string | null;
  lossPercent: number;
  sent: number;
  lastMs: number | null;
  avgMs: number | null;
  bestMs: number | null;
  worstMs: number | null;
  stdDevMs: number | null;
}

export interface MtrResult extends HostDiagnosticBase {
  type: "mtr";
  cycles: number;
  hops: MtrHop[];
}

export interface DnsRecord {
  name: string;
  type: string;
  ttl: number;
  value: string;
}

export interface DnsResult extends DiagnosticBase {
  type: "dns";
  name: string;
  recordType: DnsRecordType;
  status: "ok" | "nodata" | "nxdomain";
  records: DnsRecord[];
  simulated?: boolean;
}

export type DiagnosticResult = PingResult | TracerouteResult | MtrResult | DnsResult;

export type BgpPayload = unknown;
