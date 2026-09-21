import {
  computed,
  getCurrentScope,
  onScopeDispose,
  readonly,
  shallowRef,
} from 'vue';
import { asError } from '../shared';

export type PaymentConfirmationResult = {
  status: 'pending' | 'confirmed' | 'failed';
};
export type PaymentConfirmationStatus =
  'idle' | PaymentConfirmationResult['status'] | 'timeout' | 'error';
export interface PaymentConfirmationOptions {
  /** Call your authenticated endpoint using this captured order reference. */
  check: (
    reference: string,
    context: { signal: AbortSignal },
  ) => Promise<PaymentConfirmationResult>;
  /** Delay after each pending response. Default: 2 seconds. */
  intervalMs?: number;
  /** Maximum checks per start, including the first. Default: 10. */
  maxAttempts?: number;
  /** Total deadline, including a stalled request. Default: 30 seconds. */
  timeoutMs?: number;
}
interface ConfirmationRun {
  reference: string;
  controller: AbortController;
  done: Promise<void>;
  resolve: () => void;
  pollTimer?: ReturnType<typeof setTimeout>;
  deadlineTimer?: ReturnType<typeof setTimeout>;
}

/** Presentation only: the application server owns payment verification and fulfilment. */
export function useBachsPaymentConfirmation(
  options: PaymentConfirmationOptions,
) {
  const intervalMs = options.intervalMs ?? 2_000;
  const maxAttempts = options.maxAttempts ?? 10;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (typeof options.check !== 'function')
    throw new Error('A payment confirmation check is required.');
  if (
    ![intervalMs, timeoutMs].every(
      (value) => Number.isFinite(value) && value > 0 && value <= 2_147_483_647,
    )
  ) {
    throw new Error(
      'Confirmation intervals and timeouts must be positive timer durations.',
    );
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
    throw new Error('maxAttempts must be a positive integer.');

  const status = shallowRef<PaymentConfirmationStatus>('idle');
  const reference = shallowRef<string | null>(null);
  const attempts = shallowRef(0);
  const error = shallowRef<Error | null>(null);
  let active: ConfirmationRun | undefined;
  let disposed = false;

  function finish(
    run: ConfirmationRun,
    nextStatus: PaymentConfirmationStatus,
    failure: Error | null = null,
  ) {
    if (active !== run) return;
    active = undefined;
    clearTimeout(run.pollTimer);
    clearTimeout(run.deadlineTimer);
    run.controller.abort();
    status.value = nextStatus;
    error.value = failure;
    run.resolve();
  }
  function stop(): void {
    if (active) finish(active, 'idle');
    status.value = 'idle';
    reference.value = null;
    attempts.value = 0;
    error.value = null;
  }
  async function poll(run: ConfirmationRun): Promise<void> {
    if (active !== run) return;
    attempts.value++;
    try {
      const result = await options.check(run.reference, {
        signal: run.controller.signal,
      });
      // The old request may ignore cancellation and resolve after another order starts.
      if (active !== run) return;
      if (
        !result ||
        !['pending', 'confirmed', 'failed'].includes(result.status)
      ) {
        throw new Error('Invalid payment confirmation response.');
      }
      if (result.status !== 'pending') {
        finish(run, result.status);
      } else if (attempts.value >= maxAttempts) {
        finish(run, 'timeout');
      } else {
        run.pollTimer = setTimeout(() => void poll(run), intervalMs);
      }
    } catch (cause) {
      finish(run, 'error', asError(cause));
    }
  }
  function start(orderReference: string): Promise<void> {
    if (typeof window === 'undefined')
      return Promise.reject(
        new Error(
          'Start payment confirmation from the browser, not during SSR.',
        ),
      );
    if (disposed) return Promise.resolve();
    if (typeof orderReference !== 'string' || !orderReference.trim())
      return Promise.reject(new Error('An order reference is required.'));
    if (active?.reference === orderReference) return active.done;
    stop();
    let resolve!: () => void;
    const done = new Promise<void>((complete) => {
      resolve = complete;
    });
    const run: ConfirmationRun = {
      reference: orderReference,
      controller: new AbortController(),
      done,
      resolve,
    };
    active = run;
    reference.value = orderReference;
    status.value = 'pending';
    run.deadlineTimer = setTimeout(() => finish(run, 'timeout'), timeoutMs);
    void poll(run);
    return done;
  }
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      stop();
    });
  return {
    start,
    stop,
    status: readonly(status),
    reference: readonly(reference),
    attempts: readonly(attempts),
    error: readonly(error),
    isChecking: computed(() => status.value === 'pending'),
  };
}
