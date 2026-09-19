import { defineComponent, h, type PropType } from 'vue';
import type { BachsCheckoutEvent, BachsCheckoutOpenOptions } from '@bachs/js';
import { useBachsCheckout } from './composables';
import type { CheckoutSource } from './client';

export const BachsCheckoutButton = defineComponent({
  name: 'BachsCheckoutButton',
  inheritAttrs: false,
  props: {
    checkout: {
      type: [String, Function] as PropType<CheckoutSource>,
      required: true,
    },
    options: {
      type: Object as PropType<BachsCheckoutOpenOptions>,
      default: undefined,
    },
    disabled: Boolean,
  },
  emits: {
    event: (event: BachsCheckoutEvent) => typeof event.type === 'string',
    error: (error: unknown) => error instanceof Error,
  },
  setup(props, { attrs, slots, emit }) {
    const checkout = useBachsCheckout({
      onEvent: (event) => emit('event', event),
    });
    async function onClick() {
      if (props.disabled || checkout.isBusy.value) return;
      try {
        await checkout.open(props.checkout, props.options);
      } catch (error) {
        emit('error', error);
      }
    }
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled || checkout.isBusy.value,
          'aria-busy': checkout.isLoading.value,
          onClick,
        },
        slots.default?.({
          isLoading: checkout.isLoading.value,
          status: checkout.status.value,
        }) ??
          (checkout.isLoading.value ? 'Opening checkout…' : 'Pay with Bachs'),
      );
  },
});
