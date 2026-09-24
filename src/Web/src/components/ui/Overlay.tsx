"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { cn } from "@/lib/cn";

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  variant: "modal" | "drawer";
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  closeLabel?: string;
  hideHeader?: boolean;
}

export function Overlay({ open, onClose, title, variant, children, headerExtra, closeLabel = "Close", hideHeader }: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div aria-hidden="true" className="animate-fade-in absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "bg-bg absolute flex flex-col outline-none",
          variant === "drawer"
            ? "animate-slide-in-left inset-y-0 left-0 w-[19rem] max-w-[86vw]"
            : "animate-fade-in inset-0 sm:inset-3 sm:rounded-2xl sm:border sm:border-line-strong sm:shadow-pop"
        )}
      >
        {!hideHeader && (
          <div className="border-line bg-surface flex items-center justify-between gap-3 border-b px-4 py-3 sm:rounded-t-2xl sm:px-6">
            <h2 className="text-fg min-w-0 truncate text-base font-semibold">{title}</h2>
            <div className="flex items-center gap-2">
              {headerExtra}
              <button type="button" onClick={onClose} className="btn btn-secondary btn-sm" data-autofocus>
                <X aria-hidden="true" className="size-4" />
                {closeLabel}
                <kbd className="text-fg-3 hidden rounded border border-line-strong px-1 font-mono text-[0.6875rem] sm:inline">Esc</kbd>
              </button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
