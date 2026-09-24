import { describe, expect, it } from "vitest";
import {
  averageValue,
  formatBitRate,
  formatUtilisation,
  latestValue,
  nodeUtilisationLabel,
  parseTrafficRange,
  peakValue,
  pickRateUnit,
  toChartSeries,
  utilisationPercent
} from "./traffic";

describe("formatBitRate", () => {
  it.each([
    [0, "0 bit/s"],
    [512, "512 bit/s"],
    [1_500, "1.5 kbit/s"],
    [1_200_000, "1.2 Mbit/s"],
    [45_600_000, "45.6 Mbit/s"],
    [456_000_000, "456 Mbit/s"],
    [10_000_000_000, "10 Gbit/s"],
    [2_345_000_000, "2.35 Gbit/s"],
    [999_999, "1 Mbit/s"]
  ])("formats %d as %s", (value, expected) => {
    expect(formatBitRate(value)).toBe(expected);
  });

  it("shows a dash for missing values", () => {
    expect(formatBitRate(null)).toBe("—");
    expect(formatBitRate(undefined)).toBe("—");
    expect(formatBitRate(Number.NaN)).toBe("—");
  });

  it("picks the unit from the magnitude", () => {
    expect(pickRateUnit(0).label).toBe("bit/s");
    expect(pickRateUnit(2_000).label).toBe("kbit/s");
    expect(pickRateUnit(3e9).label).toBe("Gbit/s");
  });
});

describe("toChartSeries", () => {
  it("maps points to timestamp tuples and keeps nulls as gaps", () => {
    const series = toChartSeries([
      { at: "2026-09-24T10:00:30Z", bitsPerSecond: null },
      { at: "2026-09-24T10:00:00Z", bitsPerSecond: 100 },
      { at: "2026-09-24T10:01:00Z", bitsPerSecond: 300 }
    ]);
    expect(series).toEqual([
      [Date.parse("2026-09-24T10:00:00Z"), 100],
      [Date.parse("2026-09-24T10:00:30Z"), null],
      [Date.parse("2026-09-24T10:01:00Z"), 300]
    ]);
  });

  it("handles an empty series and drops unparseable timestamps", () => {
    expect(toChartSeries([])).toEqual([]);
    expect(toChartSeries([{ at: "nope", bitsPerSecond: 1 }])).toEqual([]);
  });

  it("summarises while skipping gaps", () => {
    const s = toChartSeries([
      { at: "2026-09-24T10:00:00Z", bitsPerSecond: 100 },
      { at: "2026-09-24T10:00:30Z", bitsPerSecond: 300 },
      { at: "2026-09-24T10:01:00Z", bitsPerSecond: null }
    ]);
    expect(latestValue(s)).toBe(300);
    expect(averageValue(s)).toBe(200);
    expect(peakValue(s)).toBe(300);
    expect(latestValue([])).toBeNull();
  });
});

describe("utilisation", () => {
  it("uses the busier direction against capacity", () => {
    expect(utilisationPercent(30_000_000, 10_000_000, 10_000_000_000)).toBeCloseTo(0.3);
  });

  it("is null without capacity or data", () => {
    expect(utilisationPercent(1, 1, null)).toBeNull();
    expect(utilisationPercent(1, 1, 0)).toBeNull();
    expect(utilisationPercent(null, null, 100)).toBeNull();
  });

  it("formats small and large percentages", () => {
    expect(formatUtilisation(0.3)).toBe("0.3%");
    expect(formatUtilisation(0.01)).toBe("<0.1%");
    expect(formatUtilisation(0)).toBe("0%");
    expect(formatUtilisation(42.4)).toBe("42%");
  });

  it("builds the node subtitle", () => {
    expect(
      nodeUtilisationLabel({
        label: "Node 1",
        capacityBitsPerSecond: 10_000_000_000,
        rx: [{ at: "2026-09-24T10:00:00Z", bitsPerSecond: 30_000_000 }],
        tx: [{ at: "2026-09-24T10:00:00Z", bitsPerSecond: 1_000_000 }]
      })
    ).toBe("0.3% of 10 Gbit/s");
  });
});

describe("parseTrafficRange", () => {
  it("accepts the contract values and falls back to 1h", () => {
    expect(parseTrafficRange("6h")).toBe("6h");
    expect(parseTrafficRange("24h")).toBe("24h");
    expect(parseTrafficRange(["6h", "24h"])).toBe("6h");
    expect(parseTrafficRange("7d")).toBe("1h");
    expect(parseTrafficRange(undefined)).toBe("1h");
  });
});
