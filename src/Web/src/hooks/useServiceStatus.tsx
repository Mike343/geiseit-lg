"use client";

import { createContext, useContext } from "react";
import { api } from "@/lib/api/browser";
import type { LoadResult } from "@/lib/api/result";
import type { StatusResponse } from "@/lib/api/types";
import { useApiQuery, type ApiQuery } from "./useApiQuery";

export const STATUS_REFRESH_MS = 30_000;

const StatusContext = createContext<ApiQuery<StatusResponse> | null>(null);

export function ServiceStatusProvider({
  initial,
  children
}: {
  initial: LoadResult<StatusResponse>;
  children: React.ReactNode;
}) {
  const query = useApiQuery((signal) => api.getStatus(signal), { initial, intervalMs: STATUS_REFRESH_MS });
  return <StatusContext.Provider value={query}>{children}</StatusContext.Provider>;
}

export function useServiceStatus(): ApiQuery<StatusResponse> {
  const context = useContext(StatusContext);
  if (!context) throw new Error("useServiceStatus must be used within a ServiceStatusProvider");
  return context;
}
