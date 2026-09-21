export {
  createBachs,
  type BachsOptions,
  type BachsClient,
  type CheckoutSource,
  type CheckoutStatus,
} from './vue/client';
export { useBachsCheckout, useBachsPortal } from './vue/composables';
export { BachsCheckoutButton } from './vue/BachsCheckoutButton';
export type { BachsCheckoutEvent, BachsCheckoutOpenOptions } from '@bachs/js';

export {
  useBachsPaymentConfirmation,
  type PaymentConfirmationOptions,
  type PaymentConfirmationResult,
  type PaymentConfirmationStatus,
} from './vue/confirmation';
