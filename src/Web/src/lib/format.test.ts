import { describe, expect, it } from "vitest";
import {
  EM_DASH,
  formatDuration,
  formatFixed,
  formatMs,
  formatPercent,
  formatRelative,
  formatUtcDateTime,
  formatUtcTime,
  formatWindow,
  pluralize
} from "./format";

describe("formatters", () => {
  it("formats milliseconds with sensible precision and handles missing values", () => {
    expect(formatMs(12.74)).toBe("12.7 ms");
    expect(formatMs(0.37)).toBe("0.37 ms");
    expect(formatMs(250.4)).toBe("250 ms");
    expect(formatMs(null)).toBe(EM_DASH);
    expect(formatMs(undefined)).toBe(EM_DASH);
    expect(formatMs(Number.NaN)).toBe(EM_DASH);
  });

  it("formats percentages without trailing zeros", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(99.9)).toBe("99.9%");
    expect(formatPercent(99.999)).toBe("100%");
    expect(formatPercent(null)).toBe(EM_DASH);
  });

  it("formats fixed decimals", () => {
    expect(formatFixed(5, 1)).toBe("5.0");
    expect(formatFixed(null)).toBe(EM_DASH);
  });

  it("formats durations", () => {
    expect(formatDuration(420)).toBe("420 ms");
    expect(formatDuration(4120)).toBe("4.1 s");
    expect(formatDuration(65_000)).toBe("1m 5s");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "hop")).toBe("1 hop");
    expect(pluralize(2, "hop")).toBe("2 hops");
    expect(pluralize(0, "responding hop")).toBe("0 responding hops");
  });

  it("labels the uptime window with the real measured window, never a longer one", () => {
    expect(formatWindow(0)).toBe("Collecting data");
    expect(formatWindow(null)).toBe("Collecting data");
    expect(formatWindow(45)).toBe("Last 45 seconds");
    expect(formatWindow(720)).toBe("Last 12 minutes");
    expect(formatWindow(60)).toBe("Last 1 minute");
    expect(formatWindow(3 * 3600)).toBe("Last 3 hours");
    expect(formatWindow(86_400)).toBe("Last 24 hours");
    expect(formatWindow(30 * 86_400)).toBe("Last 30 days");
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-09-24T14:00:00Z");
    expect(formatRelative("2026-09-24T13:59:58Z", now)).toBe("just now");
    expect(formatRelative("2026-09-24T13:59:15Z", now)).toBe("45 seconds ago");
    expect(formatRelative("2026-09-24T13:58:00Z", now)).toBe("2 minutes ago");
    expect(formatRelative("2026-09-24T11:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelative("2026-09-20T14:00:00Z", now)).toBe("4 days ago");
    expect(formatRelative("nonsense", now)).toBe(EM_DASH);
  });

  it("formats UTC timestamps deterministically for server rendering", () => {
    expect(formatUtcTime("2026-09-24T14:03:09.000Z")).toBe("14:03:09 UTC");
    expect(formatUtcDateTime("2026-09-24T14:03:09+00:00")).toBe("2026-09-24 14:03:09 UTC");
    expect(formatUtcTime("bad")).toBe(EM_DASH);
  });
});
