import {
  computed,
  readonly,
  shallowRef,
  type App,
  type InjectionKey,
} from 'vue';
import {
  loadBachs,
  type Bachs,
  type BachsCheckoutEvent,
  type BachsCheckoutOpenOptions,
} from '@bachs/js';
import { asError, httpsUrl } from '../shared';

export type CheckoutStatus =
  | 'idle'
  | 'loading'
  | 'open'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'closed'
  | 'error';
export type CheckoutSource = string | (() => string | Promise<string>);
export interface BachsOptions {
  /** Optional Bachs checkout origin. Never put an API key here. */
  checkoutOrigin?: string;
  /** Time allowed for the browser SDK to load. Defaults to 15 seconds. */
  loadTimeoutMs?: number;
}

// The upstream SDK owns one overlay per browser, including across Vue apps.
let overlayOwner: symbol | undefined;

export function createBachs(options: BachsOptions = {}) {
  const status = shallowRef<CheckoutStatus>('idle');
  const error = shallowRef<Error | null>(null);
  const lastEvent = shallowRef<BachsCheckoutEvent | null>(null);
  const visible = shallowRef(false);
  const pending = shallowRef(false);
  const listeners = new Set<(event: BachsCheckoutEvent) => void>();
  const owner = Symbol('bachs-overlay');
  let sdk: Bachs | undefined;
  let generation = 0;
  const timeoutMs = options.loadTimeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('loadTimeoutMs must be positive.');
  const baseUrl = options.checkoutOrigin
    ? new URL(httpsUrl(options.checkoutOrigin)).origin
    : undefined;

  async function load(): Promise<Bachs> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        loadBachs(baseUrl ? { baseUrl } : undefined),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Bachs checkout failed to load in time.')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  function release() {
    if (overlayOwner === owner) overlayOwner = undefined;
  }

  function close(): void {
    generation++;
    if (overlayOwner === owner) sdk?.Checkout.close();
    release();
    visible.value = false;
    pending.value = false;
    status.value = 'closed';
  }

  async function open(
    source: CheckoutSource,
    checkoutOptions?: BachsCheckoutOpenOptions,
  ): Promise<void> {
    if (typeof window === 'undefined')
      throw new Error(
        'Open checkout from a browser interaction, not during SSR.',
      );
    if (pending.value || visible.value) return;
    if (overlayOwner)
      throw new Error('Another Bachs checkout is already active.');
    overlayOwner = owner;
    const attempt = ++generation;
    pending.value = true;
    error.value = null;
    lastEvent.value = null;
    status.value = 'loading';
    try {
      const checkoutUrl = httpsUrl(
        typeof source === 'function' ? await source() : source,
      );
      if (attempt !== generation) return;
      sdk = await load();
      if (attempt !== generation) return;
      if (sdk.Checkout.isOpen())
        throw new Error('A Bachs checkout is already open.');
      await sdk.Checkout.open({
        checkoutUrl,
        options: checkoutOptions,
        onEvent(event) {
          if (attempt !== generation) return;
          lastEvent.value = event;
          switch (event.type) {
            case 'checkout.opened':
            case 'checkout.loaded':
            case 'checkout.ready':
              visible.value = true;
              status.value = 'open';
              break;
            case 'checkout.completed':
              status.value = 'completed';
              break;
            case 'checkout.failed':
              status.value = 'failed';
              break;
            case 'checkout.expired':
              status.value = 'expired';
              break;
            case 'checkout.error':
              status.value = 'error';
              error.value = new Error('Bachs reported a checkout error.');
              break;
            case 'checkout.closed':
              visible.value = false;
              if (status.value === 'open' || status.value === 'loading')
                status.value = 'closed';
              release();
              break;
          }
          for (const listener of listeners) {
            try {
              listener(event);
            } catch (cause) {
              console.error(
                'Bachs checkout event handler failed.',
                asError(cause),
              );
            }
          }
        },
      });
      if (attempt !== generation) return;
      visible.value = sdk.Checkout.isOpen();
      if (status.value === 'loading')
        status.value = visible.value ? 'open' : 'closed';
      if (!visible.value) release();
    } catch (cause) {
      if (attempt !== generation) return;
      error.value = asError(cause);
      status.value = 'error';
      visible.value = false;
      release();
      throw error.value;
    } finally {
      if (attempt === generation) pending.value = false;
    }
  }

  const checkout = {
    open,
    close,
    status: readonly(status),
    error: readonly(error),
    lastEvent: readonly(lastEvent),
    isOpen: readonly(visible),
    isLoading: readonly(pending),
    isBusy: computed(() => pending.value || visible.value),
  };
  return {
    checkout,
    subscribe(listener: (event: BachsCheckoutEvent) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    install(app: App): void {
      app.provide(bachsKey, this);
      app.onUnmount(() => {
        close();
        listeners.clear();
      });
    },
  };
}

export type BachsClient = ReturnType<typeof createBachs>;
export const bachsKey: InjectionKey<BachsClient> = Symbol('bachs');
