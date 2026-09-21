# Vue API

## `createBachs(options?)`

Returns a Vue plugin. Install once per application with `app.use(createBachs())`. Nuxt installs it for you. Initialization does not load remote scripts; the official SDK loads on the first checkout attempt.

| Option           | Default                                | Meaning                                                                                             |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `checkoutOrigin` | Inferred from the trusted checkout URL | Trusted Bachs origin used to load the SDK. Set only if Bachs gives you a different checkout origin. |
| `loadTimeoutMs`  | `15000`                                | Browser SDK load timeout.                                                                           |

Without an override, only `https://checkout.bachs.io` and `https://sandbox-checkout.bachs.io` are accepted. The wrapper selects the SDK origin from the session URL and configures it before opening checkout. An explicit `checkoutOrigin` pins the allowed origin. The upstream SDK is a browser singleton, so initialize/manage it through this plugin rather than independently reconfiguring it elsewhere. API key prefixes select the **server API** environment; they are never passed to this plugin.

## `useBachsCheckout({ onEvent? }?)`

Call inside component setup. All consumers in one app share the checkout controller and its state. Event subscriptions are removed when their Vue scope is disposed. Unmounting one component does not close an overlay owned by the app; call `close()` if that is your desired navigation behavior. Unmounting the entire app closes it.

| Member                   | Meaning                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `open(source, options?)` | Accepts a checkout URL or an async function returning one. Resolves when the overlay has mounted, **not when payment completes**. |
| `close()`                | Closes this app's overlay and invalidates pending checkout work.                                                                  |
| `status`                 | Readonly ref: `idle`, `loading`, `open`, `completed`, `failed`, `expired`, `closed`, or `error`.                                  |
| `isLoading`              | Session factory/SDK initialization is pending.                                                                                    |
| `isOpen`                 | Overlay is visible.                                                                                                               |
| `isBusy`                 | Either pending or visible; use to disable competing buttons.                                                                      |
| `error`                  | Latest operation error, or `null`.                                                                                                |
| `lastEvent`              | Latest typed SDK event, or `null`.                                                                                                |

`open()` rejects on server or SDK failures. Catch it and show a useful retry action. Duplicate opens in the same controller are ignored while busy; another app's active overlay causes a rejection. Do not call `open()` during SSR.

The second argument accepts the official `showCloseButton` and `autoCloseOnComplete` options. A completed/failed/expired status is retained when the SDK closes the overlay, even if loading/readiness events arrive after the payment outcome. Callbacks from a closed overlay are ignored. On a new attempt, errors and the previous event are cleared.

```ts
const checkout = useBachsCheckout({
  onEvent(event) {
    if (event.type === 'checkout.completed') {
      // Update presentation, then read fulfilment state from your server.
    }
  },
});
await checkout.open(checkoutUrl, { autoCloseOnComplete: false });
```

If the SDK script fails or times out, check your network/CSP and reload before retrying. The upstream loader can retain a failed script element or an unresolved load promise; this package releases its busy state but cannot reset upstream loader internals.

## `BachsCheckoutButton`

Unstyled native `<button type="button">`. Props:

- `checkout` (required): checkout URL or URL factory.
- `options`: official overlay UI options.
- `disabled`: externally disabled state.

Attributes such as `class`, `id`, and `aria-label` are forwarded. The component also disables itself while checkout is busy and sets `aria-busy` while loading. Emits `event` for checkout events and `error` for errors opening checkout. Event listeners observe the app's shared checkout, including attempts opened by another button. Use the default slot to supply content; scoped slot props are `isLoading` and `status`.

```vue
<BachsCheckoutButton :checkout="createSession" @error="showError">
  <template #default="{ isLoading }">
    {{ isLoading ? 'Opening…' : 'Upgrade plan' }}
  </template>
</BachsCheckoutButton>
```

## `useBachsPortal()`

Returns `open(source)`, readonly `isLoading`, and readonly `error`. Call `open()` from a browser interaction with a fresh portal URL or a factory that requests one from your server. It navigates the current tab. Concurrent clicks are ignored, and an unmounted scope will not perform a late redirect.

The returned URL must be HTTPS with no embedded username/password. Supply it only from your own authenticated backend; URL validation does not establish customer ownership. Portal URLs themselves carry credentials and must not be logged, cached, or shared.

## `useBachsPaymentConfirmation(options)` {#usebachspaymentconfirmationoptions}

Show the difference between checkout finishing and your server confirming the order. This composable calls your own endpoint; it does not verify a payment, process webhooks, create orders, or grant access. No Bachs plugin is required for this composable alone.

```vue
<script setup lang="ts">
import { watch } from 'vue';
import {
  useBachsPaymentConfirmation,
  type PaymentConfirmationResult,
} from 'bachs-vue';

const props = defineProps<{ orderId: string }>();
const { status, start, stop, isChecking } = useBachsPaymentConfirmation({
  async check(orderId, { signal }) {
    const response = await fetch(
      `/api/billing/orders/${encodeURIComponent(orderId)}/confirmation`,
      { signal, credentials: 'same-origin', cache: 'no-store' },
    );
    if (!response.ok) throw new Error('Could not check payment.');
    return (await response.json()) as PaymentConfirmationResult;
  },
});
watch(() => props.orderId, stop, { flush: 'sync' });
// Call start(theOrderId) after that order's checkout completion event,
// or when its confirmation page mounts. This example also allows manual checks.
</script>

<template>
  <p aria-live="polite">Payment confirmation: {{ status }}</p>
  <button :disabled="isChecking" @click="start(orderId)">Check again</button>
</template>
```

The endpoint must authenticate the caller, authorize the order, and return `{ status: 'pending' | 'confirmed' | 'failed' }` based on durable application state. The composable checks the returned status at runtime; a raw Bachs response or a browser event is not this contract. Use `confirmed` only after server verification and the necessary application updates. Treat ongoing processing as `pending`, and reserve `failed` for a failure established by your backend. Authentication/transport errors should use an appropriate HTTP error.

| Option                         | Default  | Meaning                                                                                    |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `check(reference, { signal })` | Required | Query your endpoint using the captured order reference. Forward the abort signal to fetch. |
| `intervalMs`                   | `2000`   | Delay after a pending response; checks never overlap within one run.                       |
| `maxAttempts`                  | `10`     | Maximum checks per run, including the first.                                               |
| `timeoutMs`                    | `30000`  | Total deadline, including a stalled request.                                               |

| Member             | Meaning                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(reference)` | Starts immediately; resolves when polling stops. Same-reference clicks share an active run. A different reference cancels the previous run. Call again for a manual retry. |
| `stop()`           | Cancels work and resets state to `idle`. Call on logout, account changes, or navigation that keeps the component alive.                                                    |
| `status`           | Readonly ref: `idle`, `pending`, `confirmed`, `failed`, `timeout`, or `error`.                                                                                             |
| `isChecking`       | Readonly computed ref; true while pending.                                                                                                                                 |
| `attempts`         | Readonly count of checks started in the current run.                                                                                                                       |
| `reference`        | Readonly current order reference, or null after reset.                                                                                                                     |
| `error`            | Readonly endpoint/check error, or null. Display a suitable application message.                                                                                            |

Pending responses are retried within both limits. A rejected check or malformed result stops immediately with `error`; it is not automatically retried. `timeout` means confirmation is still unknown, not that payment failed. Normal polling failures are exposed in state rather than rejected from `start()`; invalid references and starting during SSR reject before any request.

Call in component setup. Nothing starts automatically or during SSR. Unmounting cancels timers and requests; late responses are ignored even if the checker ignores cancellation. Calls after scope disposal do nothing. Outside a Vue scope, the caller must call `stop()` itself. Capture the order ID that owns the checkout rather than reading an unrelated current selection in an event callback.

## Exported types

`BachsOptions`, `BachsClient`, `CheckoutSource`, `CheckoutStatus`, `BachsCheckoutEvent`, and `BachsCheckoutOpenOptions`. Since 0.2.0, the confirmation API adds `PaymentConfirmationOptions`, `PaymentConfirmationResult`, and `PaymentConfirmationStatus`.

[Official Bachs overlay contract](https://docs.bachs.io/guides/checkout/overlay-checkout)
