import type {
  ActivityResponse,
  DnsResult,
  MtrResult,
  NetworkInfo,
  PerformanceResponse,
  PingResult,
  StatusResponse,
  TracerouteResult
} from "@/lib/api/types";

export const status: StatusResponse = {
  overall: "operational",
  checkedAt: "2026-09-24T14:00:00.000Z",
  version: "1.0.0",
  components: [
    { id: "web", name: "Looking Glass", status: "operational", detail: null, latencyMs: null },
    { id: "api", name: "API", status: "operational", detail: null, latencyMs: null },
    { id: "diagnostics", name: "Diagnostics", status: "operational", detail: null, latencyMs: 3.1 },
    { id: "bgp", name: "BGP", status: "notConfigured", detail: "BGP is not enabled on this Looking Glass.", latencyMs: null },
    { id: "ipv4", name: "IPv4 Connectivity", status: "operational", detail: "Average latency 12.7 ms", latencyMs: 12.7 },
    { id: "ipv6", name: "IPv6 Connectivity", status: "outage", detail: "No IPv6 connectivity detected", latencyMs: null }
  ]
};

export const network: NetworkInfo = {
  brand: "GeiseIT",
  location: "GeiseIT Network",
  hostname: "lg.geiseit.com",
  ipv4: "198.51.100.10",
  ipv6: null,
  asn: "AS64512",
  network: "GeiseIT",
  platform: "Kubernetes",
  connectivity: "Internet",
  version: "1.0.0"
};

export const performance: PerformanceResponse = {
  generatedAt: "2026-09-24T14:00:00.000Z",
  windowSeconds: 720,
  intervalSeconds: 60,
  avgLatencyMs: 12.7,
  uptimePercent: 99.9,
  ipv4: {
    status: "operational",
    avgLatencyMs: 12.1,
    uptimePercent: 100,
    samples: [
      { at: "2026-09-24T13:58:00.000Z", latencyMs: 12 },
      { at: "2026-09-24T13:59:00.000Z", latencyMs: null }
    ]
  },
  ipv6: { status: "outage", avgLatencyMs: null, uptimePercent: 0, samples: [] }
};

export const activity: ActivityResponse = {
  enabled: true,
  items: [{ type: "ping", target: "8.8.8.8", summary: "12.4 ms avg, 0% loss", at: "2026-09-24T13:58:00.000Z" }]
};

export const ping: PingResult = {
  requestId: "req-ping-1",
  type: "ping",
  destination: "dns.google",
  resolvedAddress: "8.8.8.8",
  family: "ipv4",
  startedAt: "2026-09-24T14:03:11.120+00:00",
  durationMs: 4120,
  transmitted: 5,
  received: 5,
  lossPercent: 0,
  minMs: 11.2,
  avgMs: 12.4,
  maxMs: 14.4,
  stdDevMs: 1.1,
  replies: [1, 2, 3, 4, 5].map((seq) => ({ seq, ttl: 117, timeMs: 12 + seq / 10 })),
  technicalOutput: "PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.",
  simulated: false
};

export const traceroute: TracerouteResult = {
  requestId: "req-trace-1",
  type: "traceroute",
  destination: "cloudflare.com",
  resolvedAddress: "104.16.132.229",
  family: "ipv4",
  startedAt: "2026-09-24T14:03:11.120+00:00",
  durationMs: 9800,
  reachedDestination: true,
  hops: [
    { hop: 1, responded: true, redacted: true, address: null, hostname: null, rttMs: [0.4, 0.3, 0.4], avgMs: 0.37 },
    { hop: 2, responded: true, redacted: false, address: "203.0.113.9", hostname: "core1.example.net", rttMs: [5.1, null, 5.3], avgMs: 5.2 },
    { hop: 3, responded: false, redacted: false, address: null, hostname: null, rttMs: [null, null, null], avgMs: null }
  ],
  technicalOutput: "traceroute to cloudflare.com",
  simulated: true
};

export const mtr: MtrResult = {
  requestId: "req-mtr-1",
  type: "mtr",
  destination: "1.1.1.1",
  resolvedAddress: "1.1.1.1",
  family: "ipv4",
  startedAt: "2026-09-24T14:03:11.120+00:00",
  durationMs: 12000,
  cycles: 10,
  hops: [
    { hop: 1, responded: true, redacted: true, address: null, hostname: null, lossPercent: 0, sent: 10, lastMs: 0.4, avgMs: 0.5, bestMs: 0.3, worstMs: 0.9, stdDevMs: 0.2 },
    { hop: 2, responded: true, redacted: false, address: "1.1.1.1", hostname: "one.one.one.one", lossPercent: 10, sent: 10, lastMs: 12, avgMs: 12.7, bestMs: 11.9, worstMs: 14, stdDevMs: 0.7 }
  ],
  technicalOutput: "HOST: lg",
  simulated: false
};

export const dnsNoData: DnsResult = {
  requestId: "req-dns-1",
  type: "dns",
  name: "example.com",
  recordType: "MX",
  startedAt: "2026-09-24T14:03:11.120+00:00",
  durationMs: 31,
  status: "nodata",
  records: [],
  technicalOutput: ";; QUESTION"
};
