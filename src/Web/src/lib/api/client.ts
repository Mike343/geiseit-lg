import axios from "axios";
import { toApiError } from "./errors";

export const client = axios.create({
  baseURL: "/api/v1",
  timeout: 15_000,
  headers: { Accept: "application/json, application/problem+json" }
});

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error))
);
