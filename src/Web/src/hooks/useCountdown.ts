"use client";

import { useEffect, useState } from "react";

export interface Countdown {
  remaining: number;
  active: boolean;
}

export function useCountdown(seconds: number | null | undefined, token?: unknown): Countdown {
  const [remaining, setRemaining] = useState(() => (seconds && seconds > 0 ? Math.ceil(seconds) : 0));

  useEffect(() => {
    if (!seconds || seconds <= 0) {
      setRemaining(0);
      return;
    }
    const endsAt = Date.now() + Math.ceil(seconds) * 1000;
    setRemaining(Math.ceil(seconds));

    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) window.clearInterval(timer);
    }, 250);

    return () => window.clearInterval(timer);
  }, [seconds, token]);

  return { remaining, active: remaining > 0 };
}
