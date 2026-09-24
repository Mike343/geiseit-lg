"use client";

import { useId, useRef } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  idPrefix?: string;
  className?: string;
}

export function tabIds(prefix: string, id: string) {
  return { tab: `${prefix}-tab-${id}`, panel: `${prefix}-panel-${id}` };
}

export function Tabs({ tabs, value, onChange, label, idPrefix, className }: TabsProps) {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const focusTab = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (!target) return;
    onChange(target.id);
    refs.current.get(target.id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  };

  return (
    <div role="tablist" aria-label={label} className={cn("bg-subtle inline-flex gap-1 rounded-xl p-1", className)}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        const ids = tabIds(prefix, tab.id);
        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) refs.current.set(tab.id, node);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-selected={selected}
            aria-controls={ids.panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors",
              selected ? "bg-surface text-fg shadow-card" : "text-fg-2 hover:text-fg"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
