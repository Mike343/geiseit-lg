"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_GROUPS, isActive } from "@/lib/nav";
import { Logo } from "./Logo";

interface SidebarProps {
  onNavigate?: () => void;
  onClose?: () => void;
  className?: string;
}

export function Sidebar({ onNavigate, onClose, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn("bg-surface flex h-full flex-col", className)}>
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link href="/" onClick={onNavigate} aria-label="GeiseIT Network Looking Glass, dashboard" className="rounded-lg">
          <Logo />
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close navigation" className="btn btn-ghost btn-icon btn-sm -mr-2 size-9 min-h-0">
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-6">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label ?? "root"} className={cn(index > 0 && "mt-5")}>
            {group.label && (
              <h2 className="text-fg-3 px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">{group.label}</h2>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                        active ? "bg-brand-soft text-brand-fg font-semibold" : "text-fg-2 hover:bg-subtle hover:text-fg"
                      )}
                    >
                      {active && <span aria-hidden="true" className="bg-brand absolute inset-y-2 left-0 w-1 rounded-r-full" />}
                      <Icon aria-hidden="true" className={cn("size-[1.125rem] shrink-0", !active && "text-fg-3 group-hover:text-fg-2")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
