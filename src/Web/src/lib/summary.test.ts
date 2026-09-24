import { describe, expect, it } from "vitest";
import { dnsNoData, mtr, ping, traceroute } from "@/test/fixtures";
import { summarizeDns, summarizeMtr, summarizePing, summarizeTraceroute } from "./summary";

describe("result summaries", () => {
  it("summarises ping in plain language", () => {
    expect(summarizePing(ping)).toEqual(["12.4 ms average latency", "0% packet loss"]);
    expect(summarizePing({ ...ping, received: 0, lossPercent: 100, avgMs: null })[0]).toMatch(/No replies/);
  });

  it("counts responding traceroute hops", () => {
    const lines = summarizeTraceroute(traceroute);
    expect(lines[0]).toBe("Route contains 2 responding hops");
    expect(lines).toContain("1 hop did not respond");
    expect(lines).toContain("Destination reached");
  });

  it("summarises MTR using the last responding hop", () => {
    const lines = summarizeMtr(mtr);
    expect(lines[0]).toBe("Route contains 2 responding hops over 10 cycles");
    expect(lines[1]).toContain("12.7 ms average latency and 10% loss");
  });

  it("explains nodata and nxdomain without treating them as errors", () => {
    expect(summarizeDns(dnsNoData)[0]).toBe("example.com exists but has no MX records");
    expect(summarizeDns({ ...dnsNoData, status: "nxdomain" })[0]).toMatch(/does not exist/);
  });
});
