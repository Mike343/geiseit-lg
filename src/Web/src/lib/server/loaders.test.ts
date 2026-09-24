import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerApi, DEFAULT_API_INTERNAL_URL, resolveApiBaseUrl, SERVER_API_TIMEOUT_MS } from "./api";
import { loadDashboard } from "./loaders";

describe("resolveApiBaseUrl", () => {
  it("defaults to the local API", () => {
    expect(resolveApiBaseUrl({} as NodeJS.ProcessEnv)).toBe(`${DEFAULT_API_INTERNAL_URL}/api/v1`);
  });

  it("uses API_INTERNAL_URL and strips trailing slashes", () => {
    expect(resolveApiBaseUrl({ API_INTERNAL_URL: "http://looking-glass-api:8080/" } as unknown as NodeJS.ProcessEnv)).toBe(
      "http://looking-glass-api:8080/api/v1"
    );
  });

  it("treats a blank value as unset", () => {
    expect(resolveApiBaseUrl({ API_INTERNAL_URL: "  " } as unknown as NodeJS.ProcessEnv)).toBe(`${DEFAULT_API_INTERNAL_URL}/api/v1`);
  });

  it("uses a short timeout so an unresponsive API cannot stall rendering", () => {
    expect(SERVER_API_TIMEOUT_MS).toBeLessThanOrEqual(3000);
  });
});

describe("server data loaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("degrade to failed results instead of throwing when the API is down", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://127.0.0.1:1");
    const data = await loadDashboard();

    for (const result of [data.status, data.network, data.performance, data.activity]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("network_error");
        expect(JSON.parse(JSON.stringify(result.error))).toEqual(result.error);
      }
    }
  });

  it("maps problem responses from the API into plain errors", async () => {
    const api = createServerApi("http://127.0.0.1:1/api/v1");
    await expect(api.getStatus()).rejects.toMatchObject({ code: "network_error" });
  });
});
