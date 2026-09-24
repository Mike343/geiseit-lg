import type { AxiosInstance } from "axios";
import type {
  ActivityResponse,
  BgpPayload,
  DestinationRequest,
  DiagnosticKind,
  DiagnosticRequest,
  DiagnosticResult,
  NetworkInfo,
  PerformanceResponse,
  StatusResponse
} from "./types";

const DIAGNOSTIC_TIMEOUT_MS = 120_000;

export function createEndpoints(http: AxiosInstance) {
  const get = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
    const response = await http.get<T>(url, { signal });
    return response.data;
  };

  const post = async <T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> => {
    const response = await http.post<T>(url, body, { signal, timeout: DIAGNOSTIC_TIMEOUT_MS });
    return response.data;
  };

  return {
    getStatus: (signal?: AbortSignal) => get<StatusResponse>("/status", signal),
    getNetwork: (signal?: AbortSignal) => get<NetworkInfo>("/network", signal),
    getPerformance: (signal?: AbortSignal) => get<PerformanceResponse>("/network/performance", signal),
    getActivity: (signal?: AbortSignal) => get<ActivityResponse>("/activity", signal),
    getBgp: (path: string, signal?: AbortSignal) => get<BgpPayload>(`/bgp/${path}`, signal),
    runDiagnostic: (kind: DiagnosticKind, body: DiagnosticRequest | DestinationRequest, signal?: AbortSignal) =>
      post<DiagnosticResult>(`/diagnostics/${kind}`, body, signal)
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
