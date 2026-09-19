<script setup lang="ts">
const {
  status,
  isBusy,
  error: checkoutError,
} = useBachsCheckout({
  onEvent(event) {
    events.value = [event.type, ...events.value].slice(0, 8);
    if (
      event.type === 'checkout.completed' ||
      event.type === 'checkout.expired'
    )
      orders.clear();
  },
});
const portal = useBachsPortal();
const { isLoading: portalLoading, error: portalError } = portal;
const events = ref<string[]>([]);
const message = ref('');
const orders = new Map<string, string>();
async function createCheckout(plan: 'one-time' | 'subscription') {
  message.value = '';
  const orderId = orders.get(plan) ?? crypto.randomUUID();
  orders.set(plan, orderId);
  const session = await $fetch('/api/checkout', {
    method: 'POST',
    body: { plan, orderId },
  });
  return session.checkout_url;
}
async function manageBilling() {
  message.value = '';
  try {
    await portal.open(async () => {
      const session = await $fetch('/api/portal', { method: 'POST' });
      return session.url;
    });
  } catch {
    message.value =
      'Could not open billing. Check the server configuration and try again.';
  }
}
function reportError() {
  message.value =
    'Could not open checkout. Check the server configuration and try again.';
}
</script>

<template>
  <main>
    <header>
      <a href="https://github.com/DevAdedeji/bachs-vue" class="brand"
        >bachs<span>/vue</span></a
      ><span class="badge">SANDBOX PLAYGROUND</span>
    </header>
    <section class="intro">
      <p class="eyebrow">BILLING, BUILT INTO YOUR FLOW</p>
      <h1>Your next idea.<br /><span>Ready for checkout.</span></h1>
      <p class="lede">
        One-time purchases, subscriptions, and a place to manage it all. Powered
        by Bachs, at home in Vue and Nuxt.
      </p>
    </section>
    <section class="plans" aria-label="Try a payment flow">
      <article>
        <span class="number">01 / CHECKOUT</span>
        <h2>One good purchase.</h2>
        <p>
          Open a hosted checkout overlay for your sandbox product, without
          leaving the page.
        </p>
        <BachsCheckoutButton
          :checkout="() => createCheckout('one-time')"
          class="primary"
          @error="reportError"
          >Try a one-time payment
          <span aria-hidden="true">↗</span></BachsCheckoutButton
        >
      </article>
      <article>
        <span class="number">02 / SUBSCRIPTIONS</span>
        <h2>Keep the good going.</h2>
        <p>
          Use a recurring product to start a subscription. Bachs handles the
          billing cycle.
        </p>
        <BachsCheckoutButton
          :checkout="() => createCheckout('subscription')"
          class="secondary"
          @error="reportError"
          >Try a subscription
          <span aria-hidden="true">↗</span></BachsCheckoutButton
        >
      </article>
    </section>
    <section class="billing">
      <div>
        <h2>Already a customer?</h2>
        <p>Open a fresh, authenticated session in the Bachs billing portal.</p>
      </div>
      <button
        class="text-button"
        :disabled="portalLoading || isBusy"
        @click="manageBilling"
      >
        {{ portalLoading ? 'Opening…' : 'Manage billing →' }}
      </button>
    </section>
    <p
      v-if="message || checkoutError || portalError"
      role="alert"
      class="error"
    >
      {{ message || 'Billing is unavailable. Please try again.' }}
    </p>
    <section class="activity" aria-live="polite">
      <div>
        <span class="dot" /> CHECKOUT STATUS <strong>{{ status }}</strong>
      </div>
      <p v-if="!events.length">
        Ready when you are. Checkout events will appear here.
      </p>
      <ul v-else>
        <li v-for="(event, index) in events" :key="index">{{ event }}</li>
      </ul>
    </section>
    <footer>
      <span>Community integration · bachs-vue</span
      ><span>Sandbox only. Browser events do not grant paid access.</span>
    </footer>
  </main>
</template>

<style>
:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #203630;
  background: #f4f5ef;
  font-synthesis: none;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
main {
  max-width: 1120px;
  margin: auto;
  padding: 36px 36px 24px;
}
header,
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}
.brand {
  color: inherit;
  text-decoration: none;
  font-size: 28px;
  font-weight: 750;
  letter-spacing: -1.5px;
}
.brand span {
  font-weight: 400;
  color: #6e8077;
}
.badge,
.eyebrow,
.number {
  font-size: 11px;
  letter-spacing: 1.5px;
  font-weight: 650;
}
.badge {
  border: 1px solid #cad4c9;
  padding: 9px 12px;
  border-radius: 30px;
}
.intro {
  padding: 78px 0 42px;
  max-width: 760px;
}
.eyebrow {
  color: #5d796a;
}
h1 {
  font-size: clamp(42px, 6vw, 70px);
  line-height: 1.07;
  letter-spacing: -3px;
  margin: 24px 0;
  font-weight: 550;
}
h1 span {
  color: #798e70;
}
.lede {
  max-width: 560px;
  font-size: 17px;
  line-height: 1.7;
  color: #68766d;
}
.plans {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
article {
  padding: 30px;
  border: 1px solid #d5ddd2;
  border-radius: 16px;
  background: #fbfcf8;
}
.number {
  color: #748269;
}
h2 {
  font-size: 24px;
  letter-spacing: -0.6px;
  font-weight: 550;
  margin: 25px 0 12px;
}
article p,
.billing p {
  color: #68766d;
  font-size: 14px;
  line-height: 1.7;
  max-width: 350px;
}
button {
  font: inherit;
  cursor: pointer;
  transition:
    opacity 0.15s,
    background 0.15s;
}
button:focus-visible,
a:focus-visible {
  outline: 3px solid #78984b;
  outline-offset: 4px;
}
button:disabled {
  cursor: wait;
  opacity: 0.55;
}
.primary,
.secondary {
  width: 100%;
  border-radius: 8px;
  padding: 15px 18px;
  margin-top: 24px;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  border: 1px solid #264939;
}
.primary {
  background: #264939;
  color: #fff;
}
.secondary {
  background: transparent;
  color: #264939;
}
.billing {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 26px 0;
  gap: 20px;
}
.billing h2 {
  font-size: 18px;
  margin: 0 0 5px;
}
.billing p {
  margin: 0;
  max-width: none;
}
.text-button {
  border: 0;
  background: transparent;
  color: #264939;
  font-size: 14px;
  white-space: nowrap;
}
.activity {
  padding: 22px 25px;
  border: 1px dashed #c6d1c1;
  border-radius: 10px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #617360;
}
.activity div {
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: 0.6px;
}
.activity strong {
  margin-left: auto;
  text-transform: uppercase;
}
.activity p {
  margin-bottom: 0;
}
.activity ul {
  padding-left: 20px;
  line-height: 1.8;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #93a76b;
}
.error {
  background: #fae9df;
  color: #883c28;
  padding: 16px;
  border-radius: 8px;
  font-size: 14px;
}
footer {
  color: #7c887d;
  font-size: 10px;
  margin-top: 34px;
}
@media (max-width: 640px) {
  main {
    padding: 24px 20px;
  }
  .intro {
    padding-top: 45px;
  }
  .plans {
    grid-template-columns: 1fr;
  }
  .billing,
  footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .badge {
    font-size: 8px;
  }
  h1 {
    letter-spacing: -2px;
  }
}
</style>
