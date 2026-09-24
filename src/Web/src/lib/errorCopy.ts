import type { PlainApiError } from "@/lib/api/errors";
import type { DiagnosticKind } from "@/lib/api/types";

export interface ErrorCopy {
  title: string;
  message: string;
  tone: "danger" | "warning" | "info";
  retryable: boolean;
}

export function describeDiagnosticError(error: PlainApiError, kind: DiagnosticKind | null): ErrorCopy {
  const serverMessage = error.message;
  switch (error.code) {
    case "validation_failed":
      return {
        title: "Check the destination",
        message: serverMessage || "The request wasn't valid. Check the destination and try again.",
        tone: "warning",
        retryable: false
      };
    case "destination_blocked":
      return {
        title: "That destination can't be tested",
        message: `${serverMessage} The Looking Glass only tests publicly routable destinations.`,
        tone: "warning",
        retryable: false
      };
    case "rate_limited":
      return {
        title: "You've reached the rate limit",
        message: serverMessage || "Too many requests. Please wait a moment before trying again.",
        tone: "warning",
        retryable: true
      };
    case "busy":
      return {
        title: "The Looking Glass is busy",
        message: "All diagnostic capacity is in use right now. Please try again in a few seconds.",
        tone: "warning",
        retryable: true
      };
    case "timeout":
      return {
        title: "The diagnostic timed out",
        message:
          kind === "dns"
            ? "The DNS query did not complete before the timeout."
            : "The destination did not respond before the timeout. It may be offline, or it may filter this type of traffic.",
        tone: "danger",
        retryable: true
      };
    case "diagnostic_failed":
      return {
        title: "The diagnostic could not be completed",
        message: serverMessage || "The destination could not be resolved or reached.",
        tone: "danger",
        retryable: true
      };
    case "service_unavailable":
      return {
        title: "Diagnostics are temporarily unavailable",
        message: "The diagnostics service can't be reached right now. This is usually brief. Please try again shortly.",
        tone: "danger",
        retryable: true
      };
    case "network_error":
      return {
        title: "Can't reach the Looking Glass",
        message: "Check your connection and try again.",
        tone: "danger",
        retryable: true
      };
    case "payload_too_large":
    case "unsupported_media_type":
      return {
        title: "The request was rejected",
        message: serverMessage || "The server could not accept that request.",
        tone: "danger",
        retryable: false
      };
    default:
      return {
        title: "Something went wrong",
        message: "An unexpected error occurred while running the diagnostic. Please try again.",
        tone: "danger",
        retryable: true
      };
  }
}
