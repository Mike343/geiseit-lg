import { toPlainError, type PlainApiError } from "./errors";

export type LoadResult<T> = { ok: true; data: T; at: string } | { ok: false; error: PlainApiError };

export async function settle<T>(promise: Promise<T>): Promise<LoadResult<T>> {
  try {
    return { ok: true, data: await promise, at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: toPlainError(error) };
  }
}
