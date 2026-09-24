import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiagnosticForm } from "./DiagnosticForm";

function setup(props: Partial<React.ComponentProps<typeof DiagnosticForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<DiagnosticForm kind="ping" running={false} cooldownSeconds={0} onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return { onSubmit, onCancel, user: userEvent.setup() };
}

describe("DiagnosticForm", () => {
  it("labels the destination field and shows the run button", () => {
    setup();
    expect(screen.getByLabelText("Hostname or IP address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run ping/i })).toBeEnabled();
  });

  it("blocks empty submissions with an accessible error and focuses the field", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: /run ping/i }));

    const input = screen.getByLabelText("Hostname or IP address");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(screen.getByText(/enter a hostname or ip address/i)).toBeInTheDocument();
    expect(input.getAttribute("aria-describedby")).toContain(screen.getByText(/enter a hostname or ip address/i).closest("[id]")!.id);
  });

  it.each([
    ["192.168.1.10", /can.t be tested/i],
    ["10.1.2.3", /can.t be tested/i],
    ["127.0.0.1", /can.t be tested/i],
    ["::1", /can.t be tested/i],
    ["fe80::1", /can.t be tested/i],
    ["fd00::1", /can.t be tested/i],
    ["https://example.com", /not a url/i],
    ["example.com/path", /path/i],
    ["exa mple.com", /spaces/i]
  ])("shows a friendly message for %s and does not submit", async (value, message) => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText("Hostname or IP address"), value);
    await user.click(screen.getByRole("button", { name: /run ping/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("submits a normalised request with the selected IP version", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText("Hostname or IP address"), "  Example.COM ");
    await user.click(screen.getByRole("radio", { name: "IPv6" }));
    await user.click(screen.getByRole("button", { name: /run ping/i }));
    expect(onSubmit).toHaveBeenCalledWith("ping", { destination: "example.com", family: "ipv6" });
  });

  it("rejects a family that contradicts the address literal", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText("Hostname or IP address"), "8.8.8.8");
    await user.click(screen.getByRole("radio", { name: "IPv6" }));
    await user.click(screen.getByRole("button", { name: /run ping/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/that is an ipv4 address/i)).toBeInTheDocument();
  });

  it("validates on blur once the user has typed something", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Hostname or IP address"), "10.0.0.1");
    await user.tab();
    expect(screen.getByText(/can.t be tested/i)).toBeInTheDocument();
  });

  it("fills the field from an example", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: "8.8.8.8" }));
    expect(screen.getByLabelText("Hostname or IP address")).toHaveValue("8.8.8.8");
    await user.click(screen.getByRole("button", { name: /run ping/i }));
    expect(onSubmit).toHaveBeenCalledWith("ping", { destination: "8.8.8.8", family: "auto" });
  });

  it("builds a DNS request with the chosen record type", async () => {
    const { user, onSubmit } = setup({ kind: "dns" });
    expect(screen.getByLabelText("Domain name or IP address")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Domain name or IP address"), "example.com");
    await user.selectOptions(screen.getByLabelText("Record type"), "MX");
    await user.click(screen.getByRole("button", { name: /run dns lookup/i }));
    expect(onSubmit).toHaveBeenCalledWith("dns", { name: "example.com", recordType: "MX" });
  });

  it("offers every supported DNS record type", () => {
    setup({ kind: "dns" });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "PTR"]);
  });

  it("shows a cancel button while running and disables the run button", async () => {
    const { user, onCancel } = setup({ running: true });
    expect(screen.getByRole("button", { name: /running/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the run button during a rate limit cooldown", async () => {
    const { user, onSubmit } = setup({ cooldownSeconds: 42 });
    const button = screen.getByRole("button", { name: "Try again in 42s" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Hostname or IP address"), "8.8.8.8{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("marks the field invalid when the server rejected the destination", () => {
    setup({ serverRejected: true });
    expect(screen.getByLabelText("Hostname or IP address")).toHaveAttribute("aria-invalid", "true");
  });
});
