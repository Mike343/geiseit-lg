import { describe, expect, it } from "vitest";
import { validateDestination } from "./validation";

type Options = Parameters<typeof validateDestination>[1];

const valid = (input: string, options?: Options) => {
  const result = validateDestination(input, options);
  expect(result.ok, `${input} should be valid`).toBe(true);
  return result.ok ? result : null;
};

const invalid = (input: string, options?: Options) => {
  const result = validateDestination(input, options);
  expect(result.ok, `${input} should be rejected`).toBe(false);
  return result.ok ? "" : result.message;
};

describe("validateDestination", () => {
  it("accepts public IPv4, IPv6 and hostnames and trims whitespace", () => {
    expect(valid("8.8.8.8")?.kind).toBe("ipv4");
    expect(valid("  1.1.1.1 ")?.value).toBe("1.1.1.1");
    expect(valid("2606:4700:4700::1111")?.kind).toBe("ipv6");
    expect(valid("2001:db8::10")?.kind).toBe("ipv6");
    expect(valid("Example.COM")?.value).toBe("example.com");
    expect(valid("sub-domain.example.co.uk.")?.kind).toBe("hostname");
    expect(valid("::ffff:8.8.8.8")?.kind).toBe("ipv6");
  });

  it("rejects empty input", () => {
    expect(invalid("")).toMatch(/enter a/i);
    expect(invalid("   ")).toMatch(/enter a/i);
  });

  it.each([
    "10.0.0.1",
    "10.255.255.255",
    "127.0.0.1",
    "127.8.9.10",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255"
  ])("rejects private, loopback and reserved IPv4 %s", (input) => {
    expect(invalid(input)).toMatch(/can.t be tested/i);
  });

  it("does not treat the neighbours of private ranges as private", () => {
    valid("172.15.0.1");
    valid("172.32.0.1");
    valid("100.63.0.1");
    valid("100.128.0.1");
  });

  it.each(["::1", "::", "fe80::1", "fe80::abcd:1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"])(
    "rejects private, loopback and reserved IPv6 %s",
    (input) => {
      expect(invalid(input)).toMatch(/can.t be tested/i);
    }
  );

  it("rejects malformed addresses", () => {
    expect(invalid("999.1.1.1")).toMatch(/valid IPv4/i);
    expect(invalid("1.2.3")).toMatch(/valid IPv4/i);
    expect(invalid("01.2.3.4")).toMatch(/valid IPv4/i);
    expect(invalid("2001:::1")).toMatch(/valid IPv6/i);
    expect(invalid("1:2:3:4:5:6:7:8:9")).toMatch(/valid IPv6/i);
    expect(invalid("gggg::1")).toMatch(/valid IPv6/i);
    expect(invalid("3232235777")).toMatch(/IPv4/i);
    expect(invalid("0x7f.0.0.1")).toMatch(/incomplete|non-standard/i);
  });

  it("rejects URLs, paths, queries and credentials", () => {
    expect(invalid("https://example.com")).toMatch(/not a url/i);
    expect(invalid("http://8.8.8.8/")).toMatch(/not a url/i);
    expect(invalid("example.com/path")).toMatch(/path/i);
    expect(invalid("example.com?x=1")).toMatch(/path|query/i);
    expect(invalid("user@example.com")).toMatch(/credentials|path/i);
    expect(invalid("javascript:alert(1)")).toMatch(/not a url/i);
  });

  it("rejects spaces and shell metacharacters", () => {
    expect(invalid("example.com google.com")).toMatch(/spaces/i);
    expect(invalid("example.com;ls")).toMatch(/characters/i);
    expect(invalid("$(whoami).example.com")).toMatch(/characters/i);
    expect(invalid("a|b.example.com")).toMatch(/characters/i);
    expect(invalid("`id`.example.com")).toMatch(/characters/i);
    expect(invalid("example.com&&id")).toMatch(/characters/i);
  });

  it("rejects internal and single-label names", () => {
    expect(invalid("localhost")).toMatch(/internal/i);
    expect(invalid("printer.local")).toMatch(/internal/i);
    expect(invalid("metadata.google.internal")).toMatch(/internal/i);
    expect(invalid("kubernetes.default.svc.cluster.local")).toMatch(/internal/i);
    expect(invalid("router")).toMatch(/fully qualified/i);
  });

  it("rejects malformed hostnames", () => {
    expect(invalid("-bad.example.com")).toMatch(/hyphen/i);
    expect(invalid("bad-.example.com")).toMatch(/hyphen/i);
    expect(invalid("a..example.com")).toMatch(/empty/i);
    expect(invalid(`${"a".repeat(64)}.example.com`)).toMatch(/63/);
    expect(invalid(`${"a.".repeat(130)}com`)).toMatch(/too long/i);
    expect(invalid("bücher.example")).toMatch(/ascii|punycode/i);
    expect(invalid("under_score.example.com")).toMatch(/letters, numbers and hyphens/i);
  });

  it("allows underscores when explicitly enabled for DNS names", () => {
    valid("_dmarc.example.com", { allowUnderscore: true });
  });

  it("checks the address family against the selected IP version", () => {
    expect(invalid("2606:4700:4700::1111", { family: "ipv4" })).toMatch(/IPv6 address/);
    expect(invalid("8.8.8.8", { family: "ipv6" })).toMatch(/IPv4 address/);
    valid("8.8.8.8", { family: "ipv4" });
    valid("example.com", { family: "ipv6" });
  });

  it("uses the supplied subject in messages", () => {
    expect(invalid("", { subject: "domain name or IP address" })).toMatch(/domain name/);
  });
});
