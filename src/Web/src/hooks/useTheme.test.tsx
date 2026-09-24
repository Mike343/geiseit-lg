import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./useTheme";
import { parsePreference, resolveTheme, THEME_INIT_SCRIPT, THEME_KEY } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";

const wrapper = (initial: ThemePreference) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ThemeProvider initialPreference={initial}>{children}</ThemeProvider>;
  };

describe("useTheme", () => {
  it("persists the preference to localStorage and a cookie and applies the dark class", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    expect(result.current.preference).toBe("system");
    expect(document.documentElement).not.toHaveClass("dark");

    act(() => result.current.setPreference("dark"));

    expect(result.current.preference).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.cookie).toContain("lg-theme=dark");
    expect(document.documentElement).toHaveClass("dark");

    act(() => result.current.setPreference("light"));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("restores the stored preference on mount", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    expect(result.current.preference).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("follows the system preference when set to system", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...original(query), matches: true })) as typeof window.matchMedia;
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("system") });
    expect(result.current.resolved).toBe("dark");
    window.matchMedia = original;
  });

  it("keeps working when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper("light") });
    expect(() => act(() => result.current.setPreference("dark"))).not.toThrow();
    expect(result.current.preference).toBe("dark");
    spy.mockRestore();
    getSpy.mockRestore();
  });

  it("throws outside of a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
    error.mockRestore();
  });
});

describe("theme helpers", () => {
  it("parses unknown values as system", () => {
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("purple")).toBe("system");
    expect(parsePreference(undefined)).toBe("system");
  });

  it("resolves system using the media query result", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("ships an init script that reads storage defensively", () => {
    expect(THEME_INIT_SCRIPT).toContain("try");
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
  });
});
