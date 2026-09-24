import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

const directives = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

describe("buildCsp", () => {
  it("builds a strict nonce-based policy", () => {
    const d = directives(buildCsp("abc123"));
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(d["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d["img-src"]).toEqual(["'self'", "data:"]);
    expect(d["connect-src"]).toEqual(["'self'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
  });

  it("never allows unsafe-inline or unsafe-eval scripts in production", () => {
    const scripts = directives(buildCsp("n"))["script-src"];
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in development for React refresh", () => {
    expect(directives(buildCsp("n", true))["script-src"]).toContain("'unsafe-eval'");
  });

  it("generates unique base64 nonces", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
