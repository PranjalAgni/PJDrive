// Retry a transient async operation (e.g. a single chunk PUT) with exponential
// backoff. A failed part retries in place instead of aborting the whole file,
// so a brief network blip costs one chunk's worth of work. If the failure
// outlasts the retries, the pending-upload record still lets a later attempt
// resume from the last recorded chunk.
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
