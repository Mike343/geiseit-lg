import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down to zero and then becomes inactive", () => {
    const { result } = renderHook(() => useCountdown(3));
    expect(result.current).toEqual({ remaining: 3, active: true });

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toEqual({ remaining: 0, active: false });
  });

  it("is inactive for missing or zero durations", () => {
    expect(renderHook(() => useCountdown(null)).result.current.active).toBe(false);
    expect(renderHook(() => useCountdown(0)).result.current.active).toBe(false);
    expect(renderHook(() => useCountdown(undefined)).result.current.active).toBe(false);
  });

  it("restarts when the token changes even if the duration is identical", () => {
    const { result, rerender } = renderHook(({ token }) => useCountdown(2, token), { initialProps: { token: 1 } });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.active).toBe(false);

    rerender({ token: 2 });
    expect(result.current).toEqual({ remaining: 2, active: true });
  });
});
