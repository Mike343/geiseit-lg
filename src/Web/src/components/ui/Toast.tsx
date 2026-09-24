"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { TONE_BADGE, type Tone } from "@/lib/tones";

type ToastTone = Extract<Tone, "success" | "danger" | "info">;

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, danger: AlertTriangle, info: Info };
const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, message, tone }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), DURATION_MS));
    },
    [dismiss]
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2 sm:items-end">
          {items.map((item) => {
            const Icon = ICONS[item.tone];
            return (
              <div
                key={item.id}
                className={cn(
                  "animate-slide-up pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-pop",
                  "bg-surface text-fg border-line-strong"
                )}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg border", TONE_BADGE[item.tone])}>
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">{item.message}</span>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(item.id)}
                  className="text-fg-3 hover:text-fg hover:bg-subtle grid size-7 place-items-center rounded-md transition-colors"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
