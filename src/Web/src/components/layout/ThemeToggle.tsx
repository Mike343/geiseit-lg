"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/cn";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2]!;
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return;
    const selected = OPTIONS.findIndex((o) => o.value === preference);
    itemRefs.current[Math.max(0, selected)]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, preference]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const index = itemRefs.current.findIndex((el) => el === document.activeElement);
    const move = (next: number) => {
      event.preventDefault();
      itemRefs.current[(next + OPTIONS.length) % OPTIONS.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(OPTIONS.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Theme: ${current.label}. Change theme`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="btn btn-secondary btn-icon size-10"
      >
        <CurrentIcon aria-hidden="true" className="size-[1.125rem]" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          onKeyDown={onMenuKeyDown}
          className="bg-surface border-line-strong shadow-pop animate-fade-in absolute right-0 z-50 mt-2 w-44 rounded-xl border p-1.5"
        >
          {OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const selected = option.value === preference;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={-1}
                onClick={() => {
                  setPreference(option.value);
                  close(true);
                }}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                  selected ? "bg-brand-soft text-brand-fg" : "text-fg hover:bg-subtle"
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="flex-1 text-left">{option.label}</span>
                {selected && <Check aria-hidden="true" className="size-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
