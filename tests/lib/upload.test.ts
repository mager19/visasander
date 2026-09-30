import { describe, expect, it, vi } from 'vitest';
import { NonRetryableError, withRetry } from '@/lib/client/upload';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('retries failures and then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 0)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it('throws the last error after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withRetry(fn, 2, 0)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('does not retry a non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new NonRetryableError('invalid_type'));
    await expect(withRetry(fn, 3, 0)).rejects.toThrow('invalid_type');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
