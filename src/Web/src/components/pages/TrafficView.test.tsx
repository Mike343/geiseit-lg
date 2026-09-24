import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { LoadResult } from "@/lib/api/result";
import type { TrafficPoint, TrafficResponse } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { TrafficView } from "./TrafficView";

const api = vi.hoisted(() => ({ getTraffic: vi.fn() }));

vi.mock("@/lib/api/browser", () => ({ api }));

const chartProps = vi.hoisted(() => ({ calls: [] as { series: { name: string; data: [number, number | null][] }[] }[] }));
vi.mock("@/components/charts/ApexChart", () => ({
  ApexChart: (props: { series: { name: string; data: [number, number | null][] }[] }) => {
    chartProps.calls.push(props);
    return <div data-testid="apex-chart" />;
  }
}));

const points = (values: (number | null)[]): TrafficPoint[] =>
  values.map((bitsPerSecond, i) => ({ at: new Date(Date.UTC(2026, 8, 24, 10, 0, i * 30)).toISOString(), bitsPerSecond }));

const node = (n: number): TrafficResponse["nodes"][number] => ({
  label: `Node ${n}`,
  capacityBitsPerSecond: 10_000_000_000,
  rx: points([30_000_000, 31_000_000]),
  tx: points([1_000_000, 2_000_000])
});

const traffic = (overrides: Partial<TrafficResponse> = {}): TrafficResponse => ({
  generatedAt: "2026-09-24T10:05:00Z",
  range: "1h",
  stepSeconds: 30,
  current: {
    clusterRxBps: 1_200_000,
    clusterTxBps: 2_400_000,
    internetRxBps: 800_000,
    internetTxBps: 300_000,
    webInBps: 90_000,
    webOutBps: 1_500_000
  },
  cluster: { rx: points([1_000_000, null, 1_200_000]), tx: points([2_000_000, 2_200_000, 2_400_000]) },
  nodes: [node(1), node(2), node(3), node(4)],
  internet: { available: true, rx: points([800_000, 900_000]), tx: points([300_000, 350_000]) },
  web: { available: true, in: points([90_000, 95_000]), out: points([1_500_000, 1_600_000]) },
  ...overrides
});

const ok = (data: TrafficResponse): LoadResult<TrafficResponse> => ({ ok: true, data, at: "2026-09-24T10:05:00.000Z" });
const unavailable = { ok: false, error: { code: "service_unavailable", message: "no prometheus", status: 503 } } as const;

beforeEach(() => {
  api.getTraffic.mockReset();
  chartProps.calls.length = 0;
  window.history.replaceState(null, "", "/network/traffic");
});

describe("TrafficView", () => {
  it("renders the server data without fetching, with bit rate cards", () => {
    renderWithProviders(<TrafficView initial={ok(traffic())} initialRange="1h" />);

    const metrics = screen.getByRole("region", { name: "Current bandwidth" });
    expect(within(metrics).getByText("1.2 Mbit/s")).toBeInTheDocument();
    expect(within(metrics).getByText("2.4 Mbit/s")).toBeInTheDocument();
    expect(within(metrics).getByText("800 kbit/s")).toBeInTheDocument();
    expect(within(metrics).getByText("1.5 Mbit/s")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cluster network" })).toBeInTheDocument();
    expect(screen.getAllByTestId("apex-chart")).toHaveLength(7);
    expect(api.getTraffic).not.toHaveBeenCalled();
  });

  it("titles one chart per node from the data with its utilisation", () => {
    renderWithProviders(<TrafficView initial={ok(traffic({ nodes: [node(1), node(2)] }))} initialRange="1h" />);
    expect(screen.getByRole("heading", { name: "Node 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Node 2" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Node 3" })).not.toBeInTheDocument();
    expect(screen.getAllByText("0.3% of 10 Gbit/s")).toHaveLength(2);
  });

  it("passes null points to the chart as gaps", () => {
    renderWithProviders(<TrafficView initial={ok(traffic())} initialRange="1h" />);
    const gap = chartProps.calls.some((c) => c.series.some((s) => s.data.some(([, v]) => v === null)));
    expect(gap).toBe(true);
  });

  it("shows Not connected and no chart when the internet link is unavailable", () => {
    renderWithProviders(
      <TrafficView
        initial={ok(traffic({ internet: { available: false, rx: [], tx: [] }, current: { ...traffic().current, internetRxBps: null, internetTxBps: null } }))}
        initialRange="1h"
      />
    );
    const metrics = screen.getByRole("region", { name: "Current bandwidth" });
    expect(within(metrics).getAllByText("Not connected")).toHaveLength(2);
    expect(within(metrics).queryByText("0 bit/s")).not.toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Internet link" });
    expect(within(section).getByText("Internet link not connected")).toBeInTheDocument();
    expect(within(section).queryByTestId("apex-chart")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Web traffic served" })).getByTestId("apex-chart")).toBeInTheDocument();
  });

  it("handles unavailable web metrics the same way", () => {
    renderWithProviders(<TrafficView initial={ok(traffic({ web: { available: false, in: [], out: [] } }))} initialRange="1h" />);
    const section = screen.getByRole("region", { name: "Web traffic served" });
    expect(within(section).getByText("Web traffic not connected")).toBeInTheDocument();
    expect(within(section).queryByTestId("apex-chart")).not.toBeInTheDocument();
  });

  it("shows a message instead of an empty chart when a series has no data", () => {
    renderWithProviders(<TrafficView initial={ok(traffic({ cluster: { rx: [], tx: [] } }))} initialRange="1h" />);
    const section = screen.getByRole("region", { name: "Cluster network" });
    expect(within(section).getByText("No data for this range yet")).toBeInTheDocument();
  });

  it("shows the friendly empty state on 503 and never a broken shell", async () => {
    api.getTraffic.mockRejectedValue(new ApiError({ code: "service_unavailable", message: "x", status: 503 }));
    renderWithProviders(<TrafficView initial={unavailable} initialRange="1h" />);
    expect(screen.getByRole("heading", { name: "Traffic" })).toBeInTheDocument();
    expect(screen.getByText("Traffic data is currently unavailable")).toBeInTheDocument();
    expect(screen.getByText("The Looking Glass is still operational.")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Time range" })).toBeInTheDocument();
    await waitFor(() => expect(api.getTraffic).toHaveBeenCalledWith("1h", expect.any(AbortSignal)));
    expect(screen.getByText("Traffic data is currently unavailable")).toBeInTheDocument();
  });

  it("recovers when a later request succeeds after an unavailable render", async () => {
    api.getTraffic.mockResolvedValue(traffic());
    renderWithProviders(<TrafficView initial={unavailable} initialRange="1h" />);
    expect(await screen.findByRole("heading", { name: "Cluster network" })).toBeInTheDocument();
  });

  it("marks the initial range, syncs the URL and fetches when the range changes", async () => {
    api.getTraffic.mockResolvedValue(traffic({ range: "6h", stepSeconds: 120 }));
    const user = userEvent.setup();
    renderWithProviders(<TrafficView initial={ok(traffic())} initialRange="1h" />);

    const tabs = screen.getByRole("tablist", { name: "Time range" });
    expect(within(tabs).getByRole("tab", { name: "1 hour" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(tabs).getByRole("tab", { name: "6 hours" }));

    expect(within(tabs).getByRole("tab", { name: "6 hours" })).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("?range=6h");
    await waitFor(() => expect(api.getTraffic).toHaveBeenCalledWith("6h", expect.any(AbortSignal)));
    expect(await screen.findByRole("heading", { name: "Cluster network" })).toBeInTheDocument();
  });

  it("shows a skeleton while a new range loads and aborts the request on unmount", async () => {
    let signal: AbortSignal | undefined;
    api.getTraffic.mockImplementation((_range: string, s: AbortSignal) => {
      signal = s;
      return new Promise(() => undefined);
    });
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<TrafficView initial={ok(traffic())} initialRange="1h" />);

    await user.click(screen.getByRole("tab", { name: "24 hours" }));
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("apex-chart")).not.toBeInTheDocument();
    await waitFor(() => expect(signal).toBeDefined());

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("supports keyboard navigation of the range control", async () => {
    api.getTraffic.mockResolvedValue(traffic());
    const user = userEvent.setup();
    renderWithProviders(<TrafficView initial={ok(traffic())} initialRange="1h" />);
    screen.getByRole("tab", { name: "1 hour" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "6 hours" })).toHaveAttribute("aria-selected", "true");
  });

  it("never renders host names, addresses or interface names", () => {
    const { container } = renderWithProviders(<TrafficView initial={ok(traffic())} initialRange="1h" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(text).not.toMatch(/\b(eth\d|ens\d+|eno\d|enp\d\w*|wlan\d)\b/i);
    expect(text).not.toMatch(/\.(local|lan|internal|com)\b/i);
    expect(text).toMatch(/Node 4/);
  });
});
