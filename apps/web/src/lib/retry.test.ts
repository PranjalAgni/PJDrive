import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const promise = withRetry(fn, { retries: 2, baseDelayMs: 10 });
    // attach a rejection handler up-front so the rejection isn't unhandled
    const assertion = expect(promise).rejects.toThrow('persistent failure');
    await vi.runAllTimersAsync();
    await assertion;
    // initial attempt + 2 retries
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('invokes onRetry with the attempt number for each retry', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const promise = withRetry(fn, { baseDelayMs: 10, onRetry });
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
  });

  it('uses exponential backoff between attempts', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { baseDelayMs: 100 });

    // first attempt runs synchronously
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    // after 100ms (base * 2^0) the second attempt fires
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // second backoff is 200ms (base * 2^1); 100ms is not enough
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toBe('ok');
  });
});
