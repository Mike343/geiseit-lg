import type { ResolvedTheme } from "@/lib/theme";

export interface ChartPalette {
  text: string;
  textStrong: string;
  grid: string;
  series1: string;
  series2: string;
  danger: string;
  surface: string;
}

const PALETTES: Record<ResolvedTheme, ChartPalette> = {
  light: {
    text: "#475569",
    textStrong: "#0f172a",
    grid: "#e2e8f0",
    series1: "#0e7490",
    series2: "#c2410c",
    danger: "#dc2626",
    surface: "#ffffff"
  },
  dark: {
    text: "#aab8ca",
    textStrong: "#e7eef7",
    grid: "#233246",
    series1: "#22d3ee",
    series2: "#fb923c",
    danger: "#f87171",
    surface: "#111a25"
  }
};

export function chartPalette(theme: ResolvedTheme): ChartPalette {
  return PALETTES[theme];
}
