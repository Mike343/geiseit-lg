"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/browser";
import { isAbortError, toPlainError, type PlainApiError } from "@/lib/api/errors";
import type { DiagnosticKind, DiagnosticRequest, DiagnosticResult } from "@/lib/api/types";
import { useCountdown } from "./useCountdown";

export type DiagnosticStatus = "idle" | "running" | "success" | "error" | "cancelled";

export interface DiagnosticState {
  status: DiagnosticStatus;
  kind: DiagnosticKind | null;
  request: DiagnosticRequest | null;
  result: DiagnosticResult | null;
  error: PlainApiError | null;
}

const IDLE: DiagnosticState = { status: "idle", kind: null, request: null, result: null, error: null };

export function useDiagnostic() {
  const [state, setState] = useState<DiagnosticState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async (kind: DiagnosticKind, request: DiagnosticRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setAttempt((n) => n + 1);
    setState({ status: "running", kind, request, result: null, error: null });

    try {
      const result = await api.runDiagnostic(kind, request, controller.signal);
      if (controllerRef.current !== controller) return;
      setState({ status: "success", kind, request, result, error: null });
    } catch (caught) {
      if (controllerRef.current !== controller) return;
      if (controller.signal.aborted || isAbortError(caught)) {
        setState({ status: "cancelled", kind, request, result: null, error: null });
        return;
      }
      setState({ status: "error", kind, request, result: null, error: toPlainError(caught) });
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(IDLE);
  }, []);

  const retryAfter =
    state.error && (state.error.code === "rate_limited" || state.error.code === "busy")
      ? (state.error.retryAfterSeconds ?? null)
      : null;
  const cooldown = useCountdown(retryAfter, attempt);

  return {
    ...state,
    running: state.status === "running",
    cooldownSeconds: cooldown.remaining,
    coolingDown: cooldown.active,
    run,
    cancel,
    reset
  };
}
