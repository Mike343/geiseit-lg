import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DisplayStatus } from "@/lib/tones";
import { StatusBadge } from "./StatusBadge";

const CASES: [DisplayStatus, string][] = [
  ["operational", "Operational"],
  ["degraded", "Degraded"],
  ["outage", "Outage"],
  ["notConfigured", "Not configured"],
  ["unavailable", "Unavailable"]
];

describe("StatusBadge", () => {
  it.each(CASES)("never relies on colour alone: %s has an icon and a text label", (status, label) => {
    const { container } = render(<StatusBadge status={status} />);
    const badge = screen.getByText(label).closest("span[data-status]");
    expect(badge).toHaveAttribute("data-status", status);
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(badge).toHaveTextContent(label);
  });

  it("supports a custom label while keeping the icon", () => {
    const { container } = render(<StatusBadge status="operational" label="Connected" />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("uses a different icon per state so shape also carries meaning", () => {
    const shapes = CASES.map(([status]) => {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const html = container.querySelector("svg")?.innerHTML ?? "";
      unmount();
      return html;
    });
    expect(new Set(shapes).size).toBe(CASES.length);
  });
});
