"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <ErrorState
        title="This page couldn't be displayed"
        message="Something went wrong while loading the page. The Looking Glass itself is not affected."
        error={error.digest ? { code: "internal_error", message: "Rendering failed", requestId: error.digest } : null}
        onRetry={reset}
      />
    </div>
  );
}
