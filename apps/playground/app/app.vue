<script setup lang="ts">
import { onMounted, ref } from 'vue';
const config = useRuntimeConfig();
const events = ref<{ name: string; time: string }[]>([]);
const message = ref('');
const initializing = ref(false);
const portalReady = ref(false);
const orders = new Map<string, string>();
const {
  status,
  isBusy,
  error: checkoutError,
} = useBachsCheckout({
  onEvent(event) {
    events.value = [
      { name: event.type, time: new Date().toLocaleTimeString() },
      ...events.value,
    ].slice(0, 12);
    if (['checkout.completed', 'checkout.expired'].includes(event.type))
      orders.clear();
  },
});
const portal = useBachsPortal();
const { isLoading: portalLoading } = portal;
onMounted(async () => {
  try {
    const session = await $fetch('/api/session');
    portalReady.value = session.portalReady;
  } catch {
    message.value =
      'The sandbox is temporarily unavailable. Please try again later.';
  }
});
function errorMessage(error: unknown) {
  const data = (error as { data?: { statusMessage?: string } })?.data;
  return (
    data?.statusMessage || 'Checkout is unavailable. Please retry shortly.'
  );
}
async function createCheckout(plan: 'one-time' | 'subscription') {
  message.value = '';
  initializing.value = true;
  try {
    await $fetch('/api/session', { method: 'POST' });
    const orderId = orders.get(plan) ?? crypto.randomUUID();
    orders.set(plan, orderId);
    const session = await $fetch('/api/checkout', {
      method: 'POST',
      body: { plan, orderId },
    });
    portalReady.value = true;
    return session.checkout_url;
  } catch (error) {
    message.value = errorMessage(error);
    throw error;
  } finally {
    initializing.value = false;
  }
}
async function manageBilling() {
  message.value = '';
  try {
    await portal.open(
      async () => (await $fetch('/api/portal', { method: 'POST' })).url,
    );
  } catch (error) {
    message.value = errorMessage(error);
  }
}
function reportError(error: unknown) {
  if (!message.value) message.value = errorMessage(error);
}
</script>

<template>
  <div class="shell">
    <header>
      <a
        class="wordmark"
        :href="
          config.public.docsUrl || 'https://www.npmjs.com/package/bachs-vue'
        "
        >bachs<span>/vue</span></a
      >
      <nav aria-label="Main navigation">
        <a v-if="config.public.docsUrl" :href="config.public.docsUrl"
          >Documentation ↗</a
        >
        <a href="https://github.com/DevAdedeji/bachs-vue">GitHub ↗</a>
      </nav>
    </header>
    <main>
      <section class="intro">
        <span class="badge"><span class="dot" /> SANDBOX PLAYGROUND</span>
        <h1>Try a payment.<br /><span>See every event.</span></h1>
        <p>
          Experience checkout and customer billing with <code>bachs-vue</code>.
          Test payments only. No real money moves.
        </p>
      </section>
      <div class="workspace">
        <div class="flows">
          <section class="plans" aria-label="Choose a sandbox payment">
            <article class="plan featured">
              <span class="eyebrow">01 / ONE-TIME PAYMENT</span>
              <h2>One purchase.</h2>
              <p class="price">$5<span> USD · test payment</span></p>
              <p>
                Open checkout inside this page and watch its state change as you
                pay.
              </p>
              <BachsCheckoutButton
                :checkout="() => createCheckout('one-time')"
                :disabled="initializing || portalLoading"
                class="pay light"
                @error="reportError"
                >Try a payment
                <span aria-hidden="true">↗</span></BachsCheckoutButton
              >
            </article>
            <article class="plan">
              <span class="eyebrow">02 / SUBSCRIPTION</span>
              <h2>Keep it going.</h2>
              <p class="price">$5<span> USD / month · sandbox</span></p>
              <p>
                Start a test subscription, then manage it in your session's
                billing portal.
              </p>
              <BachsCheckoutButton
                :checkout="() => createCheckout('subscription')"
                :disabled="initializing || portalLoading"
                class="pay"
                @error="reportError"
                >Try a subscription
                <span aria-hidden="true">↗</span></BachsCheckoutButton
              >
            </article>
          </section>
          <section class="portal">
            <div>
              <h2>Your demo billing.</h2>
              <p>
                {{
                  portalReady
                    ? 'Open the customer created for this browser session.'
                    : 'Start a checkout to create your isolated sandbox customer.'
                }}
              </p>
            </div>
            <button
              class="portal-button"
              :disabled="
                !portalReady || isBusy || portalLoading || initializing
              "
              @click="manageBilling"
            >
              {{ portalLoading ? 'Opening…' : 'Open portal ↗' }}
            </button>
          </section>
          <p v-if="message || checkoutError" class="error" role="alert">
            {{ message || 'Could not open checkout. Please reload and retry.' }}
          </p>
          <details class="test-card">
            <summary>Test card details</summary>
            <p>
              Use <code>4242 4242 4242 4242</code>, a future expiry date, and
              any three-digit CVC. Never enter real card details here.
            </p>
            <p>
              Your demo uses a generated test email. Please leave it unchanged.
              Browser sessions expire after 24 hours; checkout and portal
              requests are limited.
            </p>
          </details>
        </div>
        <aside class="activity" aria-label="Checkout events">
          <div class="activity-heading">
            <h2>Event log</h2>
            <span class="status" role="status">{{ status }}</span>
          </div>
          <p v-if="!events.length" class="empty">
            Your checkout events will appear here.<br />Choose a payment flow to
            begin.
          </p>
          <ol v-else aria-live="polite" aria-relevant="additions">
            <li
              v-for="(event, index) in events"
              :key="`${event.time}-${index}`"
            >
              <span>{{ event.name }}</span
              ><time>{{ event.time }}</time>
            </li>
          </ol>
          <p class="event-note">
            These are browser events. Applications must verify server webhooks
            before granting paid access.
          </p>
        </aside>
      </div>
      <section class="install">
        <div>
          <span class="eyebrow">BUILD YOUR OWN</span>
          <h2>One package. Vue and Nuxt.</h2>
        </div>
        <code>npm install bachs-vue</code
        ><a
          v-if="config.public.docsUrl"
          :href="`${config.public.docsUrl}/getting-started`"
          >Read the guide →</a
        >
      </section>
    </main>
    <footer>
      <span>Community integration by DevAdedeji · v0.1.0</span
      ><span>Not affiliated with or endorsed by Bachs.</span>
    </footer>
  </div>
</template>

<style>
:root {
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  color: #243d32;
  background: #f5f6ef;
  font-synthesis: none;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
a {
  color: inherit;
}
button {
  font: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
a:focus-visible,
button:focus-visible,
summary:focus-visible {
  outline: 3px solid #72934f;
  outline-offset: 5px;
}
.shell {
  max-width: 1260px;
  margin: auto;
  padding: 28px 36px;
}
header,
nav,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
header {
  padding-bottom: 24px;
  border-bottom: 1px solid #d8e0d0;
}
.wordmark {
  font-size: 28px;
  font-weight: 750;
  letter-spacing: -1.6px;
  text-decoration: none;
}
.wordmark span {
  color: #6a806e;
  font-weight: 400;
}
nav {
  font-size: 13px;
}
nav a {
  text-decoration: none;
}
.intro {
  padding: 42px 0 30px;
  max-width: 690px;
}
.badge,
.eyebrow {
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 1.5px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #c9d6bf;
  border-radius: 30px;
  padding: 8px 12px;
}
.dot {
  width: 6px;
  height: 6px;
  background: #789650;
  border-radius: 50%;
}
h1 {
  font-size: clamp(38px, 5vw, 60px);
  line-height: 1.08;
  font-weight: 550;
  letter-spacing: -2.5px;
  margin: 20px 0 16px;
}
h1 span {
  color: #708467;
}
.intro p {
  line-height: 1.7;
  font-size: 15px;
  max-width: 560px;
  color: #596d5e;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 22px;
  align-items: start;
}
.plans {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.plan {
  padding: 25px;
  border: 1px solid #cdd8c5;
  border-radius: 14px;
  background: #fcfdf9;
}
.featured {
  background: #254b3c;
  color: #f4f7ee;
  border-color: #254b3c;
}
h2 {
  font-size: 23px;
  font-weight: 550;
  letter-spacing: -0.6px;
  margin: 22px 0 12px;
}
.plan p {
  font-size: 13px;
  line-height: 1.7;
  min-height: 64px;
}
.plan .price {
  font-size: 30px;
  font-weight: 600;
  margin: 16px 0;
  min-height: 0;
  letter-spacing: -1px;
}
.price span {
  display: block;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0;
  opacity: 0.8;
}
.pay {
  display: flex;
  width: 100%;
  justify-content: space-between;
  padding: 13px 14px;
  border: 1px solid #254b3c;
  border-radius: 7px;
  color: #254b3c;
  background: transparent;
  font-size: 13px;
}
.pay.light {
  background: #e7eddb;
  border-color: #e7eddb;
  color: #254b3c;
}
.portal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 0;
}
.portal h2 {
  font-size: 17px;
  margin: 0 0 6px;
}
.portal p {
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  color: #586d5d;
}
.portal-button {
  border: 0;
  background: none;
  color: #254b3c;
  white-space: nowrap;
  font-size: 13px;
}
.activity {
  border: 1px dashed #becdb5;
  border-radius: 14px;
  padding: 23px;
  min-height: 310px;
  display: flex;
  flex-direction: column;
}
.activity-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.activity h2 {
  font-size: 14px;
  margin: 0;
  letter-spacing: 0;
}
.status {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  text-transform: uppercase;
  color: #476638;
  padding: 4px 7px;
  border-radius: 4px;
  background: #e2e9d8;
}
.empty {
  font-size: 12px;
  color: #5e735d;
  line-height: 1.8;
  margin: 32px 0;
}
.activity ol {
  padding: 0;
  list-style: none;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  margin: 22px 0;
}
.activity li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #dae2d3;
}
.activity time {
  opacity: 0.65;
  white-space: nowrap;
}
.event-note {
  font-size: 10px;
  line-height: 1.7;
  color: #586d56;
  margin-top: auto;
  padding-top: 20px;
}
.test-card {
  font-size: 12px;
  line-height: 1.7;
  border-top: 1px solid #d4decd;
  padding-top: 16px;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
.test-card p {
  color: #596d5e;
}
.error {
  padding: 14px;
  border-radius: 7px;
  background: #f7e7df;
  color: #813b28;
  font-size: 13px;
}
.install {
  margin-top: 42px;
  padding: 24px 0;
  border-top: 1px solid #d8e0d0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.install h2 {
  font-size: 18px;
  margin: 8px 0 0;
}
.install code {
  padding: 14px 18px;
  background: #e8eddf;
  border-radius: 7px;
  font-size: 13px;
}
.install a {
  font-size: 13px;
}
footer {
  font-size: 10px;
  color: #657960;
  margin-top: 24px;
}
@media (max-width: 950px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .activity {
    min-height: 210px;
  }
}
@media (max-width: 600px) {
  .shell {
    padding: 20px;
  }
  .plans {
    grid-template-columns: 1fr;
  }
  nav {
    gap: 14px;
    font-size: 11px;
  }
  .wordmark {
    font-size: 24px;
  }
  .intro {
    padding-top: 30px;
  }
  .plan p {
    min-height: 0;
  }
  .portal,
  .install,
  footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .portal-button {
    padding: 0;
  }
}
</style>
