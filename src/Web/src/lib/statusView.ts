import type { ServiceComponent, StatusResponse } from "@/lib/api/types";
import type { DisplayStatus } from "@/lib/tones";

export function findComponent(status: StatusResponse | undefined, id: string): ServiceComponent | undefined {
  return status?.components.find((c) => c.id === id);
}

export function toDisplayStatus(value: string | undefined): DisplayStatus {
  return value === "operational" || value === "degraded" || value === "outage" || value === "notConfigured" ? value : "unavailable";
}

export interface OverallView {
  status: DisplayStatus;
  headline: string;
  detail: string;
}

export function describeOverall(status: StatusResponse | undefined): OverallView {
  if (!status) {
    return {
      status: "unavailable",
      headline: "Status unavailable",
      detail: "The status service can't be reached right now. Diagnostics may still work, and this page keeps retrying."
    };
  }
  const affected = status.components.filter((c) => c.status === "degraded" || c.status === "outage").map((c) => c.name);
  switch (status.overall) {
    case "operational":
      return { status: "operational", headline: "Online", detail: "All systems operational" };
    case "degraded":
      return {
        status: "degraded",
        headline: "Degraded",
        detail: affected.length ? `Reduced performance: ${affected.join(", ")}` : "Some components are degraded"
      };
    case "outage":
      return {
        status: "outage",
        headline: "Service disruption",
        detail: affected.length ? `Affected: ${affected.join(", ")}` : "Some components are unavailable"
      };
    default:
      return { status: "unavailable", headline: "Status unavailable", detail: "The current status could not be determined." };
  }
}
