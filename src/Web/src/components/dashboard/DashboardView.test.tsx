import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceStatusProvider } from "@/hooks/useServiceStatus";
import { ApiError } from "@/lib/api/errors";
import type { LoadResult } from "@/lib/api/result";
import { activity, network, ping, performance, status } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { DashboardView } from "./DashboardView";

const api = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getNetwork: vi.fn(),
  getPerformance: vi.fn(),
  getActivity: vi.fn(),
  runDiagnostic: vi.fn()
}));

vi.mock("@/lib/api/browser", () => ({ api }));
vi.mock("@/components/charts/ApexChart", () => ({ ApexChart: () => <div data-testid="apex-chart" /> }));

const ok = <T,>(data: T): LoadResult<T> => ({ ok: true, data, at: "2026-09-24T14:00:00.000Z" });
const down = { ok: false, error: { code: "network_error", message: "unreachable" } } as const;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("DashboardView", () => {
  it("renders server provided data: status, metrics, location, chart and activity", () => {
    renderWithProviders(
      <ServiceStatusProvider initial={ok(status)}>
        <DashboardView initial={{ network: ok(network), performance: ok(performance), activity: ok(activity) }} />
      </ServiceStatusProvider>
    );

    const hero = screen.getByRole("region", { name: "Looking Glass status" });
    expect(within(hero).getByText("Online")).toBeInTheDocument();
    expect(within(hero).getByText("All systems operational")).toBeInTheDocument();
    expect(within(hero).getByText("GeiseIT Network")).toBeInTheDocument();

    const metrics = screen.getByRole("region", { name: "Key metrics" });
    expect(within(metrics).getByText("Outage")).toBeInTheDocument();
    expect(within(metrics).getByText("No IPv6 connectivity detected")).toBeInTheDocument();
    expect(within(metrics).getByText("Not configured")).toBeInTheDocument();
    expect(within(metrics).getByText("12.7 ms")).toBeInTheDocument();
    expect(within(metrics).getByText("99.9%")).toBeInTheDocument();
    expect(within(metrics).getByText("Last 12 minutes")).toBeInTheDocument();
    expect(within(metrics).queryByText(/30 days/i)).not.toBeInTheDocument();

    expect(screen.getByText("198.51.100.10")).toBeInTheDocument();
    expect(screen.getByText("Not published")).toBeInTheDocument();
    expect(screen.getByTestId("apex-chart")).toBeInTheDocument();
    expect(screen.getByText("12.4 ms avg, 0% loss")).toBeInTheDocument();
    expect(api.getStatus).not.toHaveBeenCalled();
  });

  it("neutralises the BGP card when BGP is not configured", () => {
    renderWithProviders(
      <ServiceStatusProvider initial={ok(status)}>
        <DashboardView initial={{ network: ok(network), performance: ok(performance), activity: ok(activity) }} />
      </ServiceStatusProvider>
    );
    const bgp = screen.getByRole("heading", { name: "BGP" }).closest(".card") as HTMLElement;
    expect(within(bgp).getByText("Not configured")).toBeInTheDocument();
    expect(within(bgp).getByText("BGP is not enabled on this Looking Glass.")).toBeInTheDocument();
    expect(bgp.innerHTML).not.toContain("text-danger");
  });

  it("replaces recent activity with a neutral note when disabled", () => {
    renderWithProviders(
      <ServiceStatusProvider initial={ok(status)}>
        <DashboardView initial={{ network: ok(network), performance: ok(performance), activity: ok({ enabled: false, items: [] }) }} />
      </ServiceStatusProvider>
    );
    expect(screen.getByText(/recent activity isn.t shown/i)).toBeInTheDocument();
  });

  it("shows an empty state when there is no activity yet", () => {
    renderWithProviders(
      <ServiceStatusProvider initial={ok(status)}>
        <DashboardView initial={{ network: ok(network), performance: ok(performance), activity: ok({ enabled: true, items: [] }) }} />
      </ServiceStatusProvider>
    );
    expect(screen.getByText("No recent diagnostics yet")).toBeInTheDocument();
  });

  it("degrades gracefully when every API call fails: cards say Unavailable and the page still renders", async () => {
    const failure = new ApiError({ code: "network_error", message: "unreachable" });
    api.getStatus.mockRejectedValue(failure);
    api.getNetwork.mockRejectedValue(failure);
    api.getPerformance.mockRejectedValue(failure);
    api.getActivity.mockRejectedValue(failure);

    renderWithProviders(
      <ServiceStatusProvider initial={down}>
        <DashboardView initial={{ network: down, performance: down, activity: down }} />
      </ServiceStatusProvider>
    );

    expect(await screen.findByText("Status unavailable")).toBeInTheDocument();
    const metrics = screen.getByRole("region", { name: "Key metrics" });
    expect(within(metrics).getAllByText("Unavailable").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole("heading", { name: "Quick diagnostic" })).toBeInTheDocument();
    expect(screen.getByText(/recent activity is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("runs a quick ping inline without leaving the page", async () => {
    api.runDiagnostic.mockResolvedValue(ping);
    const user = userEvent.setup();
    renderWithProviders(
      <ServiceStatusProvider initial={ok(status)}>
        <DashboardView initial={{ network: ok(network), performance: ok(performance), activity: ok(activity) }} />
      </ServiceStatusProvider>
    );

    await user.type(screen.getByLabelText("What would you like to test?"), "8.8.8.8");
    await user.click(screen.getByRole("button", { name: "Ping" }));

    expect(await screen.findByText("Ping to dns.google")).toBeInTheDocument();
    expect(api.runDiagnostic).toHaveBeenCalledWith("ping", { destination: "8.8.8.8", family: "auto" }, expect.any(AbortSignal));
  });

  it("offers Traceroute, MTR and DNS from the quick diagnostic and validates first", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServiceStatusProvider initial={ok(status)}>
        <DashboardView initial={{ network: ok(network), performance: ok(performance), activity: ok(activity) }} />
      </ServiceStatusProvider>
    );
    for (const name of ["Ping", "Traceroute", "MTR", "DNS"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    await user.type(screen.getByLabelText("What would you like to test?"), "192.168.0.1");
    await user.click(screen.getByRole("button", { name: "MTR" }));
    expect(api.runDiagnostic).not.toHaveBeenCalled();
    expect(screen.getByText(/can.t be tested/i)).toBeInTheDocument();
  });

  it("runs DNS as a reverse lookup when given an IP address", async () => {
    api.runDiagnostic.mockResolvedValue(ping);
    const user = userEvent.setup();
    renderWithProviders(
      <ServiceStatusProvider initial={ok(status)}>
        <DashboardView initial={{ network: ok(network), performance: ok(performance), activity: ok(activity) }} />
      </ServiceStatusProvider>
    );
    await user.type(screen.getByLabelText("What would you like to test?"), "8.8.8.8");
    await user.click(screen.getByRole("button", { name: "DNS" }));
    expect(api.runDiagnostic).toHaveBeenCalledWith("dns", { name: "8.8.8.8", recordType: "PTR" }, expect.any(AbortSignal));
  });
});
