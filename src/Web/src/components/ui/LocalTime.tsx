"use client";

import { useEffect, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { formatLocalDateTime, formatLocalTime, formatRelative, formatUtcDateTime, formatUtcTime } from "@/lib/format";

interface LocalTimeProps {
  iso: string;
  mode?: "time" | "datetime" | "relative";
  className?: string;
}

export function LocalTime({ iso, mode = "datetime", className }: LocalTimeProps) {
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (mode !== "relative") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [mode, iso]);

  let text: string;
  if (!hydrated) {
    text = mode === "time" ? formatUtcTime(iso) : formatUtcDateTime(iso);
  } else if (mode === "relative") {
    text = formatRelative(iso, now);
  } else {
    text = mode === "time" ? formatLocalTime(iso) : formatLocalDateTime(iso);
  }

  return (
    <time dateTime={iso} title={hydrated ? formatLocalDateTime(iso) : formatUtcDateTime(iso)} suppressHydrationWarning className={className}>
      {text}
    </time>
  );
}
