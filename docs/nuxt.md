# Nuxt integration

```ts
export default defineNuxtConfig({
  modules: ['bachs-vue/nuxt'],
  bachs: { components: true, loadTimeoutMs: 15_000 },
});
```

The plugin is registered during SSR and hydration, but loads the browser SDK only when `open()` is called. State is created per Nuxt app, not shared between SSR requests.

The unreleased main branch also auto-imports `useBachsPaymentConfirmation`; see the [confirmation API](./vue.md#usebachspaymentconfirmationoptions).

Client auto-imports: `useBachsCheckout`, `useBachsPortal`, and (unless `components: false`) `BachsCheckoutButton`.

Server auto-imports: `useBachsServer(event)` and `readBachsWebhook(event)`.

## Private configuration

| Environment variable        | Default                                |
| --------------------------- | -------------------------------------- |
| `NUXT_BACHS_API_KEY`        | empty; API calls fail until configured |
| `NUXT_BACHS_WEBHOOK_SECRET` | empty; webhook handler fails closed    |
| `NUXT_BACHS_TIMEOUT_MS`     | `10000`                                |

These live in `runtimeConfig.bachs`. Only `checkoutOrigin` and `loadTimeoutMs` are copied into `runtimeConfig.public.bachs`. Empty server credentials do not prevent an app build or SSR rendering.

## Checkout route

The application functions below are illustrative: implement them against your own authentication, order database, and rate limiter. The package intentionally does not guess these rules.

```ts
// server/api/billing/checkout.post.ts
export default defineEventHandler(async (event) => {
  await requireSameOrigin(event);
  const user = await requireUser(event);
  await rateLimitBilling(user.id);
  const { orderId } = await validateCheckoutRequest(event);
  const order = await requireOwnedPendingOrder(user.id, orderId);

  const session = await useBachsServer(event).createCheckout(
    {
      product_cart: [
        { product_id: order.bachsProductId, quantity: order.quantity },
      ],
      customer: { customer_id: user.bachsCustomerId },
      success_url: `${useRuntimeConfig(event).appOrigin}/billing/thanks`,
      reference: order.id,
    },
    { idempotencyKey: order.checkoutIdempotencyKey },
  );

  return { checkout_url: session.checkout_url };
});
```

Derive product, quantity, customer, and return origin from trusted server state. Never pass an arbitrary browser body directly to `createCheckout()`. Persist the order/idempotency key before calling Bachs; if the network response is lost, retry that same logical operation with the same key. Avoid using unvalidated Host headers to construct production return URLs.

## Confirmation endpoint (unreleased composable)

The endpoint below reads the state your webhook/reconciliation handler has already persisted. The authentication, order lookup, and business status names are illustrative application functions, not package exports.

```ts
// server/api/billing/orders/[orderId]/confirmation.get.ts
import type { PaymentConfirmationResult } from 'bachs-vue';

export default defineEventHandler(
  async (event): Promise<PaymentConfirmationResult> => {
    setResponseHeader(event, 'Cache-Control', 'no-store');
    const user = await requireUser(event);
    await rateLimitBilling(user.id);
    const orderId = await validateOrderId(event);
    const order = await requireOwnedOrder(user.id, orderId);
    if (order.fulfilmentStatus === 'fulfilled') return { status: 'confirmed' };
    if (order.paymentStatus === 'failed') return { status: 'failed' };
    return { status: 'pending' };
  },
);
```

In a component, pass a check function that forwards both the captured order ID and abort signal:

```ts
const confirmation = useBachsPaymentConfirmation({
  check: (orderId, { signal }) =>
    $fetch(`/api/billing/orders/${encodeURIComponent(orderId)}/confirmation`, {
      signal,
    }),
});
```

Start with `confirmation.start(orderId)` after the relevant checkout finishes. Stop on logout or order changes; unmount cleanup is automatic. Use `useBachsServer(event).getCheckoutSession(order.bachsCheckoutId)` in your authorized server reconciliation flow when provider retrieval is needed. Keep polling endpoints lightweight, rate limited, and free of financial mutations.

## Customer portal

```ts
// server/api/billing/portal.post.ts
export default defineEventHandler(async (event) => {
  await requireSameOrigin(event);
  const user = await requireUser(event);
  await rateLimitBilling(user.id);
  const { url } = await useBachsServer(event).createPortalSession(
    user.bachsCustomerId,
  );
  return { url };
});
```

Never take the customer ID from the browser as authorization. Create a fresh session per request and return it only to the owning customer.

## Webhook route

```ts
// server/api/billing/webhook.post.ts
export default defineEventHandler(async (event) => {
  const notification = await readBachsWebhook(event);
  await persistAndProcessBillingEvent(notification);
  setResponseStatus(event, 204);
});
```

`persistAndProcessBillingEvent` is your durable application handler, not a package export. It should validate the relevant event data, check account/order ownership, and atomically deduplicate `notification.id` with the business update or durable queue insertion. On processing failure, return a non-2xx status so Bachs can redeliver. Do not acknowledge before durable acceptance.

Read the webhook **before** any middleware parses/consumes its body. The helper limits bodies to 1 MiB and returns 400 for invalid signatures/payloads, 405 for non-POST requests, 413 for oversized bodies, and 500 for a missing signing secret. Add an upstream request timeout and body limit as well.

## Example configuration

The runnable `examples/nuxt` app has a local, development-only sandbox route. Its `.env.example` names the additional `NUXT_DEMO_*` variables. Copy it to `examples/nuxt/.env`, supply your sandbox key and a deliverable email you control in `NUXT_DEMO_EMAIL`, run `npm run sandbox:seed` to create test products and a customer, and start with `npm run dev`. The seeder refuses live keys and persists its idempotency seed so interrupted runs can be retried. It creates a USD 5 one-time product, a USD 5 monthly product, and a test customer using that configured email. Bachs rejects non-deliverable example.com addresses even in sandbox. It preserves existing configured IDs.

This demo is deliberately not a production authentication/fulfilment implementation. Production builds render the interface but reject its billing routes. Replace those routes with your own authenticated application routes before deployment.

The local overlay example omits `success_url` and `cancel_url` because Bachs rejects loopback destinations. Use a publicly accessible HTTPS URL when testing redirect flows.
