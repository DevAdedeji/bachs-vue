# Vue API

## `createBachs(options?)`

Returns a Vue plugin. Install once per application with `app.use(createBachs())`. Nuxt installs it for you. Initialization does not load remote scripts; the official SDK loads on the first checkout attempt.

| Option           | Default                                   | Meaning                                                                                             |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `checkoutOrigin` | SDK default (`https://checkout.bachs.io`) | Trusted Bachs origin used to load the SDK. Set only if Bachs gives you a different checkout origin. |
| `loadTimeoutMs`  | `15000`                                   | Browser SDK load timeout.                                                                           |

The upstream SDK is a browser singleton. Configure a single checkout origin per page; do not mix environments/origins in multiple Vue apps on that page. The URL must match the SDK's configured origin. API key prefixes select the **server API** environment; they are never passed to this plugin.

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

The second argument accepts the official `showCloseButton` and `autoCloseOnComplete` options. A completed/failed/expired status is retained when the overlay closes. On a new attempt, errors and the previous event are cleared.

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

## Exported types

`BachsOptions`, `BachsClient`, `CheckoutSource`, `CheckoutStatus`, `BachsCheckoutEvent`, and `BachsCheckoutOpenOptions`.

[Official Bachs overlay contract](https://docs.bachs.io/guides/checkout/overlay-checkout)
