import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dnsNoData, mtr, ping, traceroute } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { ResultPanel, resultFilename } from "./ResultPanel";

vi.mock("@/components/charts/ApexChart", () => ({ ApexChart: () => <div data-testid="apex-chart" /> }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResultPanel", () => {
  it("shows the human readable summary first and the raw output in the Technical tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResultPanel result={ping} />);

    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("12.4 ms average latency")).toBeInTheDocument();
    expect(screen.getByText("0% packet loss")).toBeInTheDocument();
    expect(screen.queryByText(/PING 8.8.8.8/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Technical" }));
    expect(screen.getByRole("tab", { name: "Technical" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/PING 8.8.8.8/)).toBeInTheDocument();
    expect(screen.queryByText("12.4 ms average latency")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Technical");
  });

  it("supports arrow key navigation between tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResultPanel result={ping} />);
    screen.getByRole("tab", { name: "Summary" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Technical" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Technical" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
  });

  it("copies the technical output and confirms with inline feedback and a toast", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResultPanel result={ping} />);

    await user.click(screen.getByRole("button", { name: /copy output/i }));

    expect(await navigator.clipboard.readText()).toBe(ping.technicalOutput);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(await screen.findByText("Technical output copied")).toBeInTheDocument();
  });

  it("downloads the output as text and the full result as JSON", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:x");
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithProviders(<ResultPanel result={ping} />);
    await user.click(screen.getByRole("button", { name: /download output as/i }));
    await user.click(screen.getByRole("button", { name: /download result as/i }));

    expect(click).toHaveBeenCalledTimes(2);
    const blobs = createObjectURL.mock.calls.map((call) => (call as unknown as [Blob])[0]);
    expect(blobs[0]?.type).toContain("text/plain");
    expect(blobs[1]?.type).toContain("application/json");
    expect(await blobs[1]?.text()).toContain('"requestId": "req-ping-1"');
  });

  it("builds safe filenames", () => {
    expect(resultFilename(ping, "txt")).toBe("ping-dns.google-20260924140311.txt");
    expect(resultFilename({ ...ping, destination: "a/b c" }, "json")).toMatch(/^ping-a_b_c-\d+\.json$/);
  });

  it("opens a full screen dialog and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResultPanel result={ping} />);

    const trigger = screen.getByRole("button", { name: /full screen/i });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/full screen/i);
    expect(within(dialog).getByText("12.4 ms average latency")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows a clear banner for simulated data", () => {
    renderWithProviders(<ResultPanel result={traceroute} />);
    expect(screen.getByRole("note")).toHaveTextContent(/simulated data/i);
  });

  it("does not show the banner for real data", () => {
    renderWithProviders(<ResultPanel result={ping} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("renders traceroute timeouts and redacted hops distinctly", () => {
    renderWithProviders(<ResultPanel result={traceroute} />);
    expect(screen.getByText("Route contains 2 responding hops")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Traceroute hops" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("Internal network")).toBeInTheDocument();
    expect(rows[1]).not.toHaveTextContent("203.0.113");
    expect(within(rows[2]!).getByText("core1.example.net")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("No response")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("* * *")).toBeInTheDocument();
  });

  it("renders MTR with a summary chart above the full table and highlights loss", () => {
    renderWithProviders(<ResultPanel result={mtr} />);
    expect(screen.getAllByTestId("apex-chart").length).toBeGreaterThan(0);
    const table = screen.getByRole("table", { name: "MTR statistics per hop" });
    for (const heading of ["Hop", "Host", "IP", "Loss %", "Sent", "Last", "Avg", "Best", "Worst", "StDev"]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(within(table).getByText(/10%/)).toBeInTheDocument();
  });

  it("treats nodata as an informational result, not an error", () => {
    renderWithProviders(<ResultPanel result={dnsNoData} />);
    expect(screen.getByText("example.com exists but has no MX records")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders DNS records with type, TTL and value", () => {
    renderWithProviders(
      <ResultPanel
        result={{
          ...dnsNoData,
          status: "ok",
          records: [{ name: "example.com", type: "MX", ttl: 300, value: "10 mail.example.com" }]
        }}
      />
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("MX")).toBeInTheDocument();
    expect(within(table).getByText("300 s")).toBeInTheDocument();
    expect(within(table).getByText("10 mail.example.com")).toBeInTheDocument();
  });
});
