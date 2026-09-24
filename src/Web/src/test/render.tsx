import { render, type RenderOptions } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/hooks/useTheme";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider initialPreference="light">
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: Providers, ...options });
}

export { Providers };
