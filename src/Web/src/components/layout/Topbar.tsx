"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { breadcrumbsFor } from "@/lib/nav";
import { Breadcrumbs } from "./Breadcrumbs";
import { LogoMark } from "./Logo";
import { StatusPill } from "./StatusPill";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();

  return (
    <header className="border-line sticky top-0 z-40 border-b bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="btn btn-secondary btn-icon size-10 lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <LogoMark className="size-8 lg:hidden" />
        <div className="hidden min-w-0 flex-1 lg:block">
          <Breadcrumbs items={breadcrumbsFor(pathname)} />
        </div>
        <div className="flex-1 lg:hidden" />
        <div className="flex items-center gap-2.5">
          <StatusPill />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
