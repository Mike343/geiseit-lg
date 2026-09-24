import axios from "axios";

export type ApiErrorCode =
  | "validation_failed"
  | "destination_blocked"
  | "unsupported_media_type"
  | "payload_too_large"
  | "rate_limited"
  | "busy"
  | "timeout"
  | "diagnostic_failed"
  | "service_unavailable"
  | "bgp_unavailable"
  | "internal_error"
  | "network_error"
  | "aborted"
  | "unknown";

const KNOWN_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  "validation_failed",
  "destination_blocked",
  "unsupported_media_type",
  "payload_too_large",
  "rate_limited",
  "busy",
  "timeout",
  "diagnostic_failed",
  "service_unavailable",
  "bgp_unavailable",
  "internal_error"
]);

export interface PlainApiError {
  code: ApiErrorCode;
  message: string;
  status?: number;
  title?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string[]>;
}

export class ApiError extends Error implements PlainApiError {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly title?: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(init: PlainApiError) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.title = init.title;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.fieldErrors = init.fieldErrors;
  }

  toPlain(): PlainApiError {
    const plain: PlainApiError = { code: this.code, message: this.message };
    if (this.status !== undefined) plain.status = this.status;
    if (this.title !== undefined) plain.title = this.title;
    if (this.requestId !== undefined) plain.requestId = this.requestId;
    if (this.retryAfterSeconds !== undefined) plain.retryAfterSeconds = this.retryAfterSeconds;
    if (this.fieldErrors !== undefined) plain.fieldErrors = this.fieldErrors;
    return plain;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

const asNonNegativeNumber = (value: unknown): number | undefined => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

function codeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "validation_failed";
    case 413:
      return "payload_too_large";
    case 415:
      return "unsupported_media_type";
    case 422:
      return "destination_blocked";
    case 429:
      return "rate_limited";
    case 502:
    case 503:
      return "service_unavailable";
    case 504:
      return "timeout";
    default:
      return status >= 500 ? "internal_error" : "unknown";
  }
}

function parseFieldErrors(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) {
      const strings = messages.filter((m): m is string => typeof m === "string");
      if (strings.length > 0) result[key] = strings;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function isAbortError(error: unknown): boolean {
  return (
    axios.isCancel(error) ||
    (error instanceof ApiError && error.code === "aborted") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAbortError(error)) {
    return new ApiError({ code: "aborted", message: "The request was cancelled." });
  }

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (!response) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        return new ApiError({ code: "timeout", message: "The server took too long to respond." });
      }
      return new ApiError({ code: "network_error", message: "The Looking Glass could not be reached." });
    }

    const headers = response.headers as Record<string, unknown> | undefined;
    const body: unknown = response.data;
    const problem = isRecord(body) ? body : {};

    const rawCode = asString(problem.code);
    const code: ApiErrorCode =
      rawCode && KNOWN_CODES.has(rawCode) ? (rawCode as ApiErrorCode) : codeFromStatus(response.status);

    return new ApiError({
      code,
      status: response.status,
      title: asString(problem.title),
      message:
        asString(problem.detail) ?? asString(problem.title) ?? `The server responded with status ${response.status}.`,
      requestId: asString(problem.requestId) ?? asString(headers?.["x-request-id"]),
      retryAfterSeconds: asNonNegativeNumber(problem.retryAfterSeconds) ?? asNonNegativeNumber(headers?.["retry-after"]),
      fieldErrors: parseFieldErrors(problem.errors)
    });
  }

  if (error instanceof Error) {
    return new ApiError({ code: "unknown", message: error.message });
  }
  return new ApiError({ code: "unknown", message: "An unexpected error occurred." });
}

export function toPlainError(error: unknown): PlainApiError {
  return toApiError(error).toPlain();
}
