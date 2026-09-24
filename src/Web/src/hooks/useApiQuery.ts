"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError, toPlainError, type PlainApiError } from "@/lib/api/errors";
import type { LoadResult } from "@/lib/api/result";

interface Options<T> {
  initial?: LoadResult<T>;
  intervalMs?: number;
  enabled?: boolean;
}

export interface ApiQuery<T> {
  data: T | undefined;
  error: PlainApiError | null;
  loading: boolean;
  refreshing: boolean;
  updatedAt: string | null;
  refresh: () => void;
}

export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { initial, intervalMs, enabled = true }: Options<T> = {}
): ApiQuery<T> {
  const [data, setData] = useState<T | undefined>(initial?.ok ? initial.data : undefined);
  const [error, setError] = useState<PlainApiError | null>(initial && !initial.ok ? initial.error : null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial?.ok ? initial.at : null);
  const [refreshing, setRefreshing] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRefreshing(true);
    try {
      const next = await fetcherRef.current(controller.signal);
      if (controller.signal.aborted) return;
      setData(next);
      setError(null);
      setUpdatedAt(new Date().toISOString());
    } catch (caught) {
      if (controller.signal.aborted || isAbortError(caught)) return;
      setError(toPlainError(caught));
    } finally {
      if (controllerRef.current === controller) setRefreshing(false);
    }
  }, []);

  const hasInitialData = Boolean(initial?.ok);

  useEffect(() => {
    if (!enabled) return;
    if (!hasInitialData) void run();

    let timer: number | undefined;
    if (intervalMs && intervalMs > 0) {
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void run();
      }, intervalMs);
    }
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      controllerRef.current?.abort();
    };
  }, [enabled, hasInitialData, intervalMs, run]);

  return {
    data,
    error,
    loading: data === undefined && error === null,
    refreshing,
    updatedAt,
    refresh: () => void run()
  };
}
