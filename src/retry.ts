// Timer-driven code: exponential backoff and debounce. Tests drive these with fake timers.

export interface RetryOptions {
  retries: number; // extra attempts after the first one
  baseDelayMs: number; // delay before the first retry; doubles each time
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, baseDelayMs, maxDelayMs = Number.POSITIVE_INFINITY, onRetry } = options;
  let attempt = 0;

  for (;;) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries) throw error;
      attempt += 1;
      onRetry?.(attempt, error);
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number) {
  let handle: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: A) => {
    if (handle !== undefined) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = undefined;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = () => {
    if (handle !== undefined) clearTimeout(handle);
    handle = undefined;
  };

  return debounced;
}

/** Returns true when the token expired, using the wall clock (Date.now). */
export function isExpired(expiresAtMs: number, skewMs = 30_000): boolean {
  return Date.now() + skewMs >= expiresAtMs;
}
