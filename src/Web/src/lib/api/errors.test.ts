import { AxiosError, AxiosHeaders, CanceledError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";
import { ApiError, isAbortError, toApiError, toPlainError } from "./errors";

function httpError(status: number, data: unknown, headers: Record<string, string> = {}): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = {
    status,
    statusText: "",
    data,
    headers: new AxiosHeaders(headers),
    config
  };
  return new AxiosError("Request failed", AxiosError.ERR_BAD_RESPONSE, config, null, response);
}

describe("toApiError", () => {
  it("normalises an RFC 7807 rate limit response", () => {
    const error = toApiError(
      httpError(429, {
        type: "https://lg.geiseit.com/problems/rate_limited",
        title: "Too many requests",
        status: 429,
        detail: "You have reached the limit of 10 ping requests per minute. Try again in 42 seconds.",
        code: "rate_limited",
        requestId: "0HN7ABC",
        retryAfterSeconds: 42
      })
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("rate_limited");
    expect(error.status).toBe(429);
    expect(error.message).toContain("Try again in 42 seconds");
    expect(error.title).toBe("Too many requests");
    expect(error.requestId).toBe("0HN7ABC");
    expect(error.retryAfterSeconds).toBe(42);
  });

  it("falls back to the Retry-After and X-Request-Id headers", () => {
    const error = toApiError(
      httpError(503, { code: "busy", title: "Busy" }, { "retry-after": "5", "x-request-id": "hdr-id" })
    );
    expect(error.code).toBe("busy");
    expect(error.retryAfterSeconds).toBe(5);
    expect(error.requestId).toBe("hdr-id");
    expect(error.message).toBe("Busy");
  });

  it("keeps validation field errors", () => {
    const error = toApiError(
      httpError(400, {
        code: "validation_failed",
        detail: "One or more validation errors occurred.",
        errors: { destination: ["Destination is required."], ignored: [1, 2] }
      })
    );
    expect(error.code).toBe("validation_failed");
    expect(error.fieldErrors).toEqual({ destination: ["Destination is required."] });
  });

  it.each([
    [400, "validation_failed"],
    [413, "payload_too_large"],
    [415, "unsupported_media_type"],
    [422, "destination_blocked"],
    [429, "rate_limited"],
    [502, "service_unavailable"],
    [503, "service_unavailable"],
    [504, "timeout"],
    [500, "internal_error"],
    [404, "unknown"]
  ])("maps a non-problem %i response to %s", (status, code) => {
    expect(toApiError(httpError(status, "<html>Bad gateway</html>")).code).toBe(code);
  });

  it("ignores unknown problem codes and uses the status instead", () => {
    expect(toApiError(httpError(422, { code: "something_new" })).code).toBe("destination_blocked");
  });

  it("recognises bgp_unavailable", () => {
    const error = toApiError(httpError(503, { code: "bgp_unavailable", detail: "BGP is not configured." }));
    expect(error.code).toBe("bgp_unavailable");
  });

  it("maps a missing response to a network error", () => {
    const error = toApiError(new AxiosError("Network Error", AxiosError.ERR_NETWORK));
    expect(error.code).toBe("network_error");
    expect(error.status).toBeUndefined();
  });

  it("maps client-side timeouts", () => {
    expect(toApiError(new AxiosError("timeout", AxiosError.ECONNABORTED)).code).toBe("timeout");
  });

  it("maps cancellations to aborted", () => {
    expect(toApiError(new CanceledError("canceled")).code).toBe("aborted");
    expect(isAbortError(new CanceledError("canceled"))).toBe(true);
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
  });

  it("wraps arbitrary errors and passes ApiError through", () => {
    expect(toApiError(new Error("boom")).message).toBe("boom");
    expect(toApiError("what").code).toBe("unknown");
    const original = new ApiError({ code: "busy", message: "x" });
    expect(toApiError(original)).toBe(original);
  });

  it("produces a plain serialisable object for server to client transfer", () => {
    const plain = toPlainError(httpError(504, { code: "timeout", detail: "Too slow", requestId: "r1" }));
    expect(JSON.parse(JSON.stringify(plain))).toEqual({
      code: "timeout",
      message: "Too slow",
      status: 504,
      requestId: "r1"
    });
  });
});
