// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import {
  useBachsPaymentConfirmation,
  type PaymentConfirmationOptions,
  type PaymentConfirmationResult,
} from '../src';

const scopes: ReturnType<typeof effectScope>[] = [];
function setup(
  check: PaymentConfirmationOptions['check'],
  options: Partial<PaymentConfirmationOptions> = {},
) {
  const scope = effectScope();
  scopes.push(scope);
  return {
    scope,
    confirmation: scope.run(() =>
      useBachsPaymentConfirmation({
        check,
        intervalMs: 100,
        timeoutMs: 1_000,
        maxAttempts: 3,
        ...options,
      }),
    )!,
  };
}
function deferred() {
  let resolve!: (result: PaymentConfirmationResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PaymentConfirmationResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});

describe('payment confirmation', () => {
  it('waits for the application server to confirm and never starts during setup', async () => {
    vi.useFakeTimers();
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'confirmed' });
    const { confirmation: c } = setup(check);
    expect(c.status.value).toBe('idle');
    expect(check).not.toHaveBeenCalled();
    const done = c.start('order_1');
    expect(c.status.value).toBe('pending');
    expect(c.isChecking.value).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(c.status.value).toBe('confirmed');
    expect(c.isChecking.value).toBe(false);
    expect(c.attempts.value).toBe(2);
    expect(check.mock.calls.map(([id]) => id)).toEqual(['order_1', 'order_1']);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('deduplicates clicks and never overlaps checks for the same order', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockReturnValue(pending.promise);
    const { confirmation: c } = setup(check);
    const first = c.start('order_1');
    expect(c.start('order_1')).toBe(first);
    await vi.advanceTimersByTimeAsync(500);
    expect(check).toHaveBeenCalledTimes(1);
    pending.resolve({ status: 'confirmed' });
    await first;
    expect(c.status.value).toBe('confirmed');
  });
  it('limits attempts without falsely marking a pending payment failed', async () => {
    vi.useFakeTimers();
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockResolvedValue({ status: 'pending' });
    const { confirmation: c } = setup(check);
    const done = c.start('order_1');
    await vi.advanceTimersByTimeAsync(1_000);
    await done;
    expect(check).toHaveBeenCalledTimes(3);
    expect(c.status.value).toBe('timeout');
    expect(c.error.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('enforces the total deadline even if the checker ignores abort and never settles', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockReturnValue(pending.promise);
    const { confirmation: c } = setup(check);
    const done = c.start('order_1');
    await vi.advanceTimersByTimeAsync(1_000);
    await done;
    expect(c.status.value).toBe('timeout');
    expect(check.mock.calls[0]![1].signal.aborted).toBe(true);
    pending.resolve({ status: 'confirmed' });
    await Promise.resolve();
    expect(c.status.value).toBe('timeout');
  });
  it('stops on explicit server failure and supports a manual check again', async () => {
    vi.useFakeTimers();
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'confirmed' });
    const { confirmation: c } = setup(check);
    await c.start('order_1');
    expect(c.status.value).toBe('failed');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(check).toHaveBeenCalledTimes(1);
    await c.start('order_1');
    expect(c.status.value).toBe('confirmed');
    expect(c.attempts.value).toBe(1);
  });
  it.each([undefined, { status: 'completed' }, { status: true }])(
    'fails closed for an invalid endpoint response: %j',
    async (result) => {
      const check = vi
        .fn<PaymentConfirmationOptions['check']>()
        .mockResolvedValue(result as PaymentConfirmationResult);
      const { confirmation: c } = setup(check);
      await c.start('order_1');
      expect(c.status.value).toBe('error');
      expect(c.error.value?.message).toMatch(/Invalid/);
      expect(check).toHaveBeenCalledTimes(1);
    },
  );
  it('exposes transport errors without treating them as a failed payment or retrying authentication errors', async () => {
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce({ status: 'confirmed' });
    const { confirmation: c } = setup(check);
    await c.start('order_1');
    expect(c.status.value).toBe('error');
    expect(c.error.value?.message).toBe('Unauthorized');
    expect(check).toHaveBeenCalledTimes(1);
    await c.start('order_1');
    expect(c.error.value).toBeNull();
    expect(c.status.value).toBe('confirmed');
  });
  it.each(['resolve', 'reject'] as const)(
    'ignores an old order that finishes late via %s',
    async (outcome) => {
      const old = deferred();
      const next = deferred();
      const check = vi
        .fn<PaymentConfirmationOptions['check']>()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise);
      const { confirmation: c } = setup(check);
      const first = c.start('order_old');
      const second = c.start('order_new');
      await first;
      expect(check.mock.calls[0]![1].signal.aborted).toBe(true);
      if (outcome === 'resolve') old.resolve({ status: 'confirmed' });
      else old.reject(new Error('Old order failed'));
      await Promise.resolve();
      expect(c.reference.value).toBe('order_new');
      expect(c.status.value).toBe('pending');
      expect(c.error.value).toBeNull();
      next.resolve({ status: 'failed' });
      await second;
      expect(c.status.value).toBe('failed');
    },
  );
  it('clears a scheduled retry when stopped, and can start a different order later', async () => {
    vi.useFakeTimers();
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockResolvedValue({ status: 'pending' });
    const { confirmation: c } = setup(check);
    const done = c.start('order_1');
    await vi.advanceTimersByTimeAsync(0);
    c.stop();
    await done;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(c.status.value).toBe('idle');
    expect(c.reference.value).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    check.mockResolvedValue({ status: 'confirmed' });
    await c.start('order_2');
    expect(c.reference.value).toBe('order_2');
  });
  it('aborts on unmount and ignores later results and starts', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    const check = vi
      .fn<PaymentConfirmationOptions['check']>()
      .mockReturnValue(pending.promise);
    const { confirmation: c, scope } = setup(check);
    const done = c.start('order_1');
    scope.stop();
    await done;
    expect(check.mock.calls[0]![1].signal.aborted).toBe(true);
    pending.resolve({ status: 'confirmed' });
    await Promise.resolve();
    await c.start('order_2');
    expect(c.status.value).toBe('idle');
    expect(check).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps component instances isolated', async () => {
    const a = setup(async () => ({ status: 'confirmed' })).confirmation;
    const b = setup(async () => ({ status: 'failed' })).confirmation;
    await a.start('same_order');
    expect(b.status.value).toBe('idle');
    await b.start('same_order');
    expect(a.status.value).toBe('confirmed');
    expect(b.status.value).toBe('failed');
  });
  it.each([
    { intervalMs: 0 },
    { intervalMs: Infinity },
    { timeoutMs: -1 },
    { timeoutMs: 2 ** 32 },
    { maxAttempts: 0 },
    { maxAttempts: 1.5 },
  ])('rejects unbounded or invalid timing options %j', (options) => {
    expect(() => setup(async () => ({ status: 'pending' }), options)).toThrow();
  });
  it('rejects empty references without calling the endpoint', async () => {
    const check = vi.fn<PaymentConfirmationOptions['check']>();
    const { confirmation: c } = setup(check);
    await expect(c.start(' ')).rejects.toThrow('reference');
    expect(check).not.toHaveBeenCalled();
    expect(c.status.value).toBe('idle');
  });
});
