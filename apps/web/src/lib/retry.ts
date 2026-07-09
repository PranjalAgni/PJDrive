// Retry a transient async operation (e.g. a single chunk PUT) with exponential
// backoff. A failed part no longer aborts the whole upload - only that part is
// retried, so a brief network blip costs one chunk's worth of work instead of
// the entire file (which the browser client cannot resume across a page reload).
export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, err: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      opts.onRetry?.(attempt + 1, err);
      // Exponential backoff: 500ms, 1s, 2s, ...
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
