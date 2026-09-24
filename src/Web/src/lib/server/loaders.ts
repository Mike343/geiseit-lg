import { cache } from "react";
import { settle, type LoadResult } from "@/lib/api/result";
import type { ActivityResponse, NetworkInfo, PerformanceResponse, StatusResponse } from "@/lib/api/types";
import { createServerApi } from "./api";

export interface DashboardData {
  status: LoadResult<StatusResponse>;
  network: LoadResult<NetworkInfo>;
  performance: LoadResult<PerformanceResponse>;
  activity: LoadResult<ActivityResponse>;
}

export const loadStatus = cache(() => settle(createServerApi().getStatus()));
export const loadNetwork = cache(() => settle(createServerApi().getNetwork()));
export const loadPerformance = cache(() => settle(createServerApi().getPerformance()));
export const loadActivity = cache(() => settle(createServerApi().getActivity()));

export async function loadDashboard(): Promise<DashboardData> {
  const [status, network, performance, activity] = await Promise.all([
    loadStatus(),
    loadNetwork(),
    loadPerformance(),
    loadActivity()
  ]);
  return { status, network, performance, activity };
}
