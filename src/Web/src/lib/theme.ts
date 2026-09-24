export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "lg-theme";
export const THEME_COOKIE = "lg-theme";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parsePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function readStoredPreference(): ThemePreference | null {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored) return parsePreference(stored);
  } catch {
    return null;
  }
  return null;
}

export function persistPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_KEY, preference);
  } catch {}
  try {
    document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  } catch {}
}

export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export const THEME_INIT_SCRIPT = `(function(){try{var p=null;try{p=localStorage.getItem('${THEME_KEY}')}catch(e){}if(!p){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);p=m&&m[1]}var d=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})();`;
