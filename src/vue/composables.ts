import {
  getCurrentScope,
  inject,
  onScopeDispose,
  readonly,
  shallowRef,
} from 'vue';
import type { BachsCheckoutEvent } from '@bachs/js';
import { bachsKey, type CheckoutSource } from './client';
import { asError, httpsUrl } from '../shared';

export function useBachsCheckout(
  options: { onEvent?: (event: BachsCheckoutEvent) => void } = {},
) {
  const client = inject(bachsKey);
  if (!client)
    throw new Error(
      'Install createBachs() or the bachs-vue/nuxt module before using checkout.',
    );
  if (options.onEvent) {
    const unsubscribe = client.subscribe(options.onEvent);
    if (getCurrentScope()) onScopeDispose(unsubscribe);
  }
  return client.checkout;
}

/** Create the portal session on your authenticated server; return its URL here. */
export function useBachsPortal() {
  const isLoading = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let disposed = false;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
    });
  async function open(source: CheckoutSource): Promise<void> {
    if (typeof window === 'undefined')
      throw new Error('Open the billing portal from a browser interaction.');
    if (isLoading.value || disposed) return;
    isLoading.value = true;
    error.value = null;
    try {
      const url = httpsUrl(
        typeof source === 'function' ? await source() : source,
      );
      if (!disposed) window.location.assign(url);
    } catch (cause) {
      if (!disposed) {
        error.value = asError(cause);
        throw error.value;
      }
    } finally {
      isLoading.value = false;
    }
  }
  return { open, isLoading: readonly(isLoading), error: readonly(error) };
}
