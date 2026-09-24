import axios from "axios";
import { toApiError } from "@/lib/api/errors";
import { createEndpoints, type Endpoints } from "@/lib/api/endpoints";

export const DEFAULT_API_INTERNAL_URL = "http://localhost:5080";
export const SERVER_API_TIMEOUT_MS = 2_500;

export function resolveApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.API_INTERNAL_URL?.trim() || DEFAULT_API_INTERNAL_URL).replace(/\/+$/, "");
  return `${base}/api/v1`;
}

export function createServerApi(baseURL: string = resolveApiBaseUrl()): Endpoints {
  const http = axios.create({
    baseURL,
    timeout: SERVER_API_TIMEOUT_MS,
    headers: { Accept: "application/json, application/problem+json" }
  });
  http.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(toApiError(error))
  );
  return createEndpoints(http);
}
