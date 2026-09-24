"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Overlay } from "@/components/ui/Overlay";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children, version }: { children: React.ReactNode; version?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="min-h-dvh">
      <aside aria-label="Sidebar" className="border-line fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:block">
        <Sidebar />
      </aside>

      <Overlay open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navigation" variant="drawer" hideHeader>
        <Sidebar onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
      </Overlay>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Topbar onOpenMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
        <footer className="border-line text-fg-3 border-t px-4 py-5 text-xs sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[84rem] flex-wrap items-center justify-between gap-2">
            <p>&copy; GeiseIT. Diagnostics run from the GeiseIT network.</p>
            {version && <p>Looking Glass v{version}</p>}
          </div>
        </footer>
      </div>
    </div>
  );
}
