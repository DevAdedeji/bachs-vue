# bachs-vue

Vue composables, an accessible checkout button, and a Nuxt module for [Bachs](https://bachs.io) billing.

**Community maintained by DevAdedeji. Not affiliated with or endorsed by Bachs.**

- Lazy loading of the official `@bachs/js` checkout SDK.
- Reactive checkout state, typed events, duplicate-open protection, and scoped event cleanup.
- Nuxt auto-imports and private runtime configuration.
- Server helpers for checkout and customer portal sessions.
- Raw-body webhook verification, including V2 signatures and secret rotation.
- Runnable Vue and Nuxt examples, TypeScript declarations, and automated tests.

## Status and compatibility

Version 0.1.0 is an initial community release. GitHub source and local tarball installation are available; the npm name is not published by this repository automatically. Once published, use `npm install bachs-vue`.

ES modules only. Vue 3.5+, Nuxt 3.17+/4, and Node.js 22.12+ are the intended targets. The server entry uses Node crypto; this release targets Node server deployments, not edge runtimes.

## Try it locally

```sh
git clone https://github.com/DevAdedeji/bachs-vue.git
cd bachs-vue
npm ci
npm run build
cp examples/nuxt/.env.example examples/nuxt/.env
# Fill in your sandbox key and NUXT_DEMO_EMAIL (an email you control).
# Then create test products and a customer:
npm run sandbox:seed
npm run dev
```

The Nuxt playground runs without credentials, but payment actions report a configuration error until you supply sandbox credentials. Its API routes work only in local development and reject live keys. It does not fulfil orders or grant access.

For the plain Vue example:

```sh
npm run example:vue
```

Paste a checkout URL created by your own server. Never paste an API key.

To install the package in another project before npm publication:

```sh
# In this repository:
npm pack
# In your application, using the actual path to that file:
npm install /path/to/bachs-vue-0.1.0.tgz
```

## Nuxt quick start

Register the module in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['bachs-vue/nuxt'],
});
```

Set private runtime environment variables:

```dotenv
NUXT_BACHS_API_KEY=sk_sandbox_your_key
NUXT_BACHS_WEBHOOK_SECRET=your_endpoint_signing_secret
```

The module declares both values in **private** `runtimeConfig.bachs`. Never put them in `runtimeConfig.public`, `app.config`, module options, or a `VITE_` variable.

Your authenticated server route calls `useBachsServer(event).createCheckout()` and returns only `checkout_url`. Your component can then use:

```vue
<script setup lang="ts">
async function checkout() {
  const session = await $fetch<{ checkout_url: string }>(
    '/api/billing/checkout',
    {
      method: 'POST',
      body: { orderId: 'an-order-your-server-has-authorized' },
    },
  );
  return session.checkout_url;
}

const { status, error } = useBachsCheckout();
</script>

<template>
  <BachsCheckoutButton :checkout="checkout">Subscribe</BachsCheckoutButton>
  <p aria-live="polite">{{ status }}</p>
  <p v-if="error" role="alert">Checkout is unavailable. Please try again.</p>
</template>
```

The module adds **no payment endpoints automatically**. Authentication, order ownership, pricing decisions, CSRF protection, and rate limits belong in your application. See the [Nuxt integration guide](docs/nuxt.md) for server and webhook examples.

## Vue quick start

```ts
import { createApp } from 'vue';
import { createBachs } from 'bachs-vue';
import App from './App.vue';

createApp(App).use(createBachs()).mount('#app');
```

```vue
<script setup lang="ts">
import { useBachsCheckout } from 'bachs-vue';

const { open, isBusy, error } = useBachsCheckout();

async function pay() {
  try {
    await open(async () => {
      const response = await fetch('/api/billing/checkout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not create checkout.');
      const session: { checkout_url: string } = await response.json();
      return session.checkout_url;
    });
  } catch {
    // `error` is reactive; show a retry action in your UI.
  }
}
</script>

<template>
  <button :disabled="isBusy" @click="pay">Pay with Bachs</button>
  <p v-if="error" role="alert">Could not open checkout. Please try again.</p>
</template>
```

## Server helpers

Import these only in server code:

```ts
import { createBachsServer } from 'bachs-vue/server';

const bachs = createBachsServer({ apiKey: process.env.BACHS_API_KEY! });
const session = await bachs.createCheckout(
  {
    product_cart: [{ product_id: 'prod_example', quantity: 1 }],
    customer: { customer_id: 'cust_example' },
    success_url: 'https://your-app.example/billing/thanks',
  },
  { idempotencyKey: 'checkout_order_123' },
);
```

Persist the idempotency key with the order and reuse it for the same operation after a timeout. Sandbox/live API URLs are selected from the key prefix. Monetary inputs are decimal **strings**, for example `"29.00"`.

For a portal session, look up the customer ID from the authenticated user's server-side record:

```ts
const session = await bachs.createPortalSession(customerId);
// Return session.url only to that customer. Do not log this credential-bearing URL.
```

The v0.1 server surface covers checkout creation and portal sessions. Subscriptions start through recurring products at checkout; the hosted portal handles customer self-service. This is not a complete replacement for Bachs' REST API. Connect splits, refunds, payouts, and saved-card setup are outside this version's scope.

## Payment confirmation

A browser event or return URL is not proof of payment. Verify Bachs webhooks before granting access or fulfilling an order. Deduplicate event IDs and update your order/access records in the same durable transaction. Reconcile out-of-order subscription events against provider state. See [server and webhook guidance](docs/server.md).

## Documentation

- [Vue API](docs/vue.md)
- [Nuxt integration](docs/nuxt.md)
- [Server API and webhooks](docs/server.md)
- [Contributing](CONTRIBUTING.md)
- [Release procedure](docs/releasing.md)

## Development

```sh
npm ci
npm run check
```

`check` runs lint, formatting, types, tests, package checks, Nuxt type-checking/build, and the Vue build. No real Bachs API key is needed. Provider calls are mocked at the HTTP boundary.

MIT © DevAdedeji
