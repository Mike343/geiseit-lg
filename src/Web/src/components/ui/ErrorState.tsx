"use client";

import { AlertTriangle, ChevronDown, RotateCw } from "lucide-react";
import type { PlainApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";

interface ErrorStateProps {
  title: string;
  message: React.ReactNode;
  error?: PlainApiError | null;
  onRetry?: () => void;
  retryLabel?: string;
  retryDisabled?: boolean;
  tone?: "danger" | "warning" | "info";
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

const TONES = {
  danger: "border-danger-line bg-danger-soft text-danger",
  warning: "border-warning-line bg-warning-soft text-warning",
  info: "border-info-line bg-info-soft text-info"
};

export function ErrorState({
  title,
  message,
  error,
  onRetry,
  retryLabel = "Try again",
  retryDisabled,
  tone = "danger",
  icon,
  children,
  className
}: ErrorStateProps) {
  const hasDetails = Boolean(error && (error.code || error.status || error.requestId));
  return (
    <div role="alert" className={cn("rounded-2xl border p-4 sm:p-5", TONES[tone], className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          {icon ?? <AlertTriangle className="size-5" />}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-fg text-[0.9375rem] font-semibold">{title}</p>
          <div className="text-fg-2 text-sm">{message}</div>
          {children}
          {error?.requestId && (
            <p className="text-fg-2 flex flex-wrap items-center gap-2 text-[0.8125rem]">
              <span className="font-medium">Request ID</span>
              <code className="bg-surface text-fg rounded-md border border-current/20 px-1.5 py-0.5 font-mono text-xs break-all">
                {error.requestId}
              </code>
              <CopyButton text={error.requestId} label="Copy request ID" variant="ghost" iconOnly size="sm" />
            </p>
          )}
          {hasDetails && error && (
            <details className="group text-[0.8125rem]">
              <summary className="text-fg-2 hover:text-fg inline-flex cursor-pointer list-none items-center gap-1 font-medium select-none">
                <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
                Technical details
              </summary>
              <dl className="text-fg-2 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
                <dt>code</dt>
                <dd className="text-fg">{error.code}</dd>
                {error.status !== undefined && (
                  <>
                    <dt>status</dt>
                    <dd className="text-fg">{error.status}</dd>
                  </>
                )}
                {error.requestId && (
                  <>
                    <dt>requestId</dt>
                    <dd className="text-fg break-all">{error.requestId}</dd>
                  </>
                )}
                {error.retryAfterSeconds !== undefined && (
                  <>
                    <dt>retryAfterSeconds</dt>
                    <dd className="text-fg">{error.retryAfterSeconds}</dd>
                  </>
                )}
                <dt>detail</dt>
                <dd className="text-fg break-words">{error.message}</dd>
              </dl>
            </details>
          )}
          {onRetry && (
            <div className="pt-1">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={retryDisabled}>
                <RotateCw aria-hidden="true" className="size-4" />
                {retryLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
