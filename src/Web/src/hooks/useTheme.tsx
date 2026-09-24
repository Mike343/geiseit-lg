"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  applyTheme,
  persistPreference,
  readStoredPreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference
} from "@/lib/theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystem(callback: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

const getSystemDark = () => window.matchMedia(DARK_QUERY).matches;
const getServerSystemDark = () => false;

export function ThemeProvider({
  initialPreference,
  children
}: {
  initialPreference: ThemePreference;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const systemDark = useSyncExternalStore(subscribeToSystem, getSystemDark, getServerSystemDark);
  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    const stored = readStoredPreference();
    if (stored && stored !== initialPreference) setPreferenceState(stored);
  }, [initialPreference]);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    persistPreference(next);
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
