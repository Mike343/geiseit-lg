import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { ping } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { DiagnosticRunner } from "./DiagnosticRunner";

const runDiagnostic = vi.fn();

vi.mock("@/lib/api/browser", () => ({
  api: { runDiagnostic: (...args: unknown[]) => runDiagnostic(...args) }
}));
vi.mock("@/components/charts/ApexChart", () => ({ ApexChart: () => <div /> }));

beforeEach(() => {
  runDiagnostic.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function submit(user: ReturnType<typeof userEvent.setup>, value = "8.8.8.8") {
  await user.type(screen.getByLabelText("Hostname or IP address"), value);
  await user.click(screen.getByRole("button", { name: /run ping/i }));
}

describe("DiagnosticRunner", () => {
  it("shows the empty state before anything has run", () => {
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    expect(screen.getByText("No diagnostic results yet")).toBeInTheDocument();
    expect(screen.getByText("Enter a hostname or IP address above to begin.")).toBeInTheDocument();
  });

  it("runs a diagnostic with an abort signal and renders the result", async () => {
    runDiagnostic.mockResolvedValue(ping);
    const user = userEvent.setup();
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    await submit(user);

    expect(await screen.findByText("Ping to dns.google")).toBeInTheDocument();
    expect(runDiagnostic).toHaveBeenCalledWith("ping", { destination: "8.8.8.8", family: "auto" }, expect.any(AbortSignal));
  });

  it("aborts the in-flight request when cancelled", async () => {
    let signal: AbortSignal | undefined;
    runDiagnostic.mockImplementation(
      (_kind: string, _body: unknown, s: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = s;
          s.addEventListener("abort", () => reject(new ApiError({ code: "aborted", message: "cancelled" })));
        })
    );
    const user = userEvent.setup();
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    await submit(user);

    expect(await screen.findByText(/running ping to 8.8.8.8/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText("Diagnostic cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run ping/i })).toBeEnabled();
  });

  it("shows the server message and request ID for a blocked destination", async () => {
    runDiagnostic.mockRejectedValue(
      new ApiError({
        code: "destination_blocked",
        status: 422,
        message: "The destination 203.0.113.9 resolves to a reserved range.",
        requestId: "req-blocked"
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    await submit(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That destination can't be tested");
    expect(alert).toHaveTextContent("resolves to a reserved range");
    expect(alert).toHaveTextContent("req-blocked");
    expect(screen.getByLabelText("Hostname or IP address")).toHaveAttribute("aria-invalid", "true");
  });

  it.each([
    ["timeout", "The diagnostic timed out"],
    ["busy", "The Looking Glass is busy"],
    ["service_unavailable", "Diagnostics are temporarily unavailable"],
    ["diagnostic_failed", "The diagnostic could not be completed"],
    ["validation_failed", "Check the destination"],
    ["internal_error", "Something went wrong"]
  ] as const)("uses distinct friendly copy for %s", async (code, title) => {
    runDiagnostic.mockRejectedValue(new ApiError({ code, message: "server said no", requestId: "rid-1" }));
    const user = userEvent.setup();
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(title);
  });

  it("offers a retry for transient failures that runs the same request again", async () => {
    runDiagnostic.mockRejectedValueOnce(new ApiError({ code: "timeout", message: "slow" })).mockResolvedValueOnce(ping);
    const user = userEvent.setup();
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    await submit(user);
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Ping to dns.google")).toBeInTheDocument();
    expect(runDiagnostic).toHaveBeenCalledTimes(2);
    expect(runDiagnostic.mock.calls[1]?.[1]).toEqual({ destination: "8.8.8.8", family: "auto" });
  });

  it("counts down a rate limit and re-enables the run button when it expires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    runDiagnostic.mockRejectedValue(
      new ApiError({ code: "rate_limited", status: 429, message: "Try again in 3 seconds.", retryAfterSeconds: 3, requestId: "rl-1" })
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    await submit(user);

    const disabled = await screen.findByRole("button", { name: /try again in [23]s/i });
    expect(disabled).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("rate limit");
    expect(screen.getByText(/you can run another diagnostic in [23] seconds/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByRole("button", { name: /try again in [12]s/i })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /run ping/i })).toBeEnabled());
    expect(runDiagnostic).toHaveBeenCalledTimes(1);
  });

  it("does not submit while a cooldown is active", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    runDiagnostic.mockRejectedValue(new ApiError({ code: "rate_limited", message: "slow down", retryAfterSeconds: 30 }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<DiagnosticRunner kind="ping" />);
    await submit(user);
    await screen.findByRole("button", { name: /try again in/i });

    await user.keyboard("{Enter}");
    expect(runDiagnostic).toHaveBeenCalledTimes(1);
  });
});
