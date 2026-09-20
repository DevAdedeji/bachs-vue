# Troubleshooting

## Checkout does not open

Install `createBachs()` in Vue, or register `bachs-vue/nuxt` in Nuxt. Call the composable during component setup and open checkout in response to a browser interaction.

The checkout URL must use HTTPS and a trusted Bachs checkout origin. Sandbox sessions use `sandbox-checkout.bachs.io`; live sessions use `checkout.bachs.io`. The package selects the SDK origin from the session URL.

If your application sets a Content Security Policy, permit the required Bachs SDK script and checkout frame origins. After a script-load failure, reload before retrying: the upstream SDK may retain a failed script element.

## Checkout opens but the account is not upgraded

Opening the overlay is not payment completion. Even `checkout.completed` is only a browser signal. Verify the signed webhook, update the order and entitlement durably, then refresh your UI from your server. A webhook may arrive after the overlay closes.

## Duplicate or late events

The package ignores callbacks from closed overlays and preserves completed, failed, or expired states across late loading events. Each new attempt clears the previous error and event. Calling `close()` explicitly sets the status to `closed`.

Your webhook handler must still deduplicate event IDs. UI lifecycle protection is separate from payment processing.

## Local redirect rejected

Bachs rejects loopback return URLs. Omit redirects for local overlay tests, or use a public HTTPS origin for redirect tests. Do not disable URL validation or use a live key to bypass sandbox restrictions.

## Subscription customer missing

A subscription needs a durable customer. Supply a server-owned Bachs customer ID, or follow Bachs customer-creation requirements with a deliverable email. The local fixture script creates a customer using the email you configure.

## Webhook verification fails

Read the original body bytes before parsing. Configure the signing secret for the endpoint that delivered the event. When using a local forwarder, use its signing secret for that forwarding session.

Check the signature headers, server clock, and replay window. Do not log complete webhook bodies or signing secrets to debug a failure. See [webhook verification](./server.md).

## Server import fails in the browser

`bachs-vue/server` is for Node.js server code only. Keep it out of Vue components and public runtime configuration. The Nuxt module exposes server helpers in Nitro routes.
