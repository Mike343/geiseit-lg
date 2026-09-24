import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("/healthz", () => {
  it("returns 200 without touching the API", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers HEAD requests", () => {
    expect(HEAD().status).toBe(200);
  });
});
