import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "../styles/globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceStatusProvider } from "@/hooks/useServiceStatus";
import { ThemeProvider } from "@/hooks/useTheme";
import { loadStatus } from "@/lib/server/loaders";
import { parsePreference, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "GeiseIT Network Looking Glass", template: "%s | GeiseIT Looking Glass" },
  description:
    "Run ping, traceroute, MTR and DNS diagnostics from the GeiseIT network, and see live network status. A Kubernetes-native public Looking Glass.",
  applicationName: "GeiseIT Network Looking Glass"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1017" }
  ]
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerStore, status] = await Promise.all([cookies(), headers(), loadStatus()]);
  const preference = parsePreference(cookieStore.get(THEME_COOKIE)?.value);
  const nonce = headerStore.get("x-nonce") ?? undefined;
  const version = status.ok ? status.data.version : undefined;

  return (
    <html lang="en" className={preference === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="bg-brand text-on-brand sr-only rounded-lg px-4 py-2.5 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
        >
          Skip to main content
        </a>
        <ThemeProvider initialPreference={preference}>
          <ToastProvider>
            <ServiceStatusProvider initial={status}>
              <AppShell version={version}>{children}</AppShell>
            </ServiceStatusProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
