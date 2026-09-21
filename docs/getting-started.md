# Get started

`bachs-vue` brings Bachs checkout into Vue and Nuxt. It includes a checkout composable, an unstyled checkout button, customer portal navigation, and optional server helpers.

## Install

```sh
npm install bachs-vue
```

Supports Vue 3.5+, Nuxt 3.17+/4, and Node.js 22.12+. The package is ESM-only. Server helpers target Node.js rather than edge runtimes.

Version 0.2.0 was tested with Vue 3.5.43, Nuxt 3.21.11 and 4.5.2, and Node.js 24.14.1. It is a community release, not an official Bachs SDK.

## Nuxt

Register the module:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['bachs-vue/nuxt'],
});
```

Use your authenticated server endpoint to create a checkout session, then return its URL to the button:

```vue
<script setup lang="ts">
async function checkout() {
  const session = await $fetch<{ checkout_url: string }>(
    '/api/billing/checkout',
    {
      method: 'POST',
      body: { orderId: 'your-authorized-order-id' },
    },
  );
  return session.checkout_url;
}
</script>

<template>
  <BachsCheckoutButton :checkout="checkout">Subscribe</BachsCheckoutButton>
</template>
```

The module does not create payment endpoints. Follow the [Nuxt guide](./nuxt.md) to configure private credentials and implement checkout, portal, and webhook routes.

## Vue

Install the plugin once:

```ts
import { createApp } from 'vue';
import { createBachs } from 'bachs-vue';
import App from './App.vue';

createApp(App).use(createBachs()).mount('#app');
```

Call `useBachsCheckout()` inside component setup. Its `open()` method accepts a checkout URL or a function that obtains one from your server. See the [Vue API](./vue.md) for events, loading states, and portal navigation.

## How a payment flows

1. Your server authenticates the user and looks up the order, amount, and customer.
2. It creates a Bachs checkout with a persisted idempotency key.
3. Your frontend opens the returned URL through `bachs-vue`.
4. Your server verifies the Bachs webhook and updates the order once.

Browser completion events update the interface. They do not prove payment or grant access. Keep API keys and webhook secrets on your server.

## Scope

The server helpers cover checkout creation with optional destination splits, checkout retrieval, customer portal sessions, and webhook verification. Recurring products start subscriptions through checkout. Refunds, payouts, Connect transfers, product management, and subscription changes require Bachs APIs outside this package.

Your application owns authentication, customer ownership, pricing, rate limiting, durable webhook deduplication, and fulfilment.
