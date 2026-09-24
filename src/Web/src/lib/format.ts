export const EM_DASH = "—";

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  const digits = value < 1 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ms`;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return String(Number(value.toFixed(digits)));
}

export function formatFixed(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return `${Number(value.toFixed(digits))}%`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return EM_DASH;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatWindow(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return "Collecting data";
  }
  if (seconds < 60) return `Last ${pluralize(Math.round(seconds), "second")}`;
  const minutes = seconds / 60;
  if (minutes < 120) return `Last ${pluralize(Math.round(minutes), "minute")}`;
  const hours = minutes / 60;
  if (hours < 48) return `Last ${pluralize(Math.round(hours), "hour")}`;
  return `Last ${pluralize(Math.round(hours / 24), "day")}`;
}

export function formatRelative(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return EM_DASH;
  const diff = Math.max(0, Math.round((now - then) / 1000));
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff} seconds ago`;
  const minutes = Math.round(diff / 60);
  if (minutes < 60) return `${pluralize(minutes, "minute")} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${pluralize(hours, "hour")} ago`;
  return `${pluralize(Math.round(hours / 24), "day")} ago`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatUtcTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

export function formatUtcDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${formatUtcTime(iso)}`;
}

export function formatLocalTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}
