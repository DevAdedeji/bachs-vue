# Server API and webhook processing

Import from `bachs-vue/server` only in server code. The package's browser export rejects server imports, and the client constructor also rejects browser execution. Do not put keys in client configuration or serialize server objects.

## `createBachsServer(options)`

| Option        | Behavior                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `apiKey`      | Required `sk_sandbox_...` or `sk_live_...`; never logged.                                                 |
| `environment` | Optional `sandbox` or `live`; must match the key.                                                         |
| `timeoutMs`   | Positive request timeout, default 10 seconds, including response parsing.                                 |
| `fetch`       | Optional fetch-compatible transport, primarily for tests. A custom transport must honor the abort signal. |

The client uses HTTPS Bachs API origins, rejects HTTP redirects, validates response shapes, and does not automatically retry requests. Provider error bodies are not copied into error objects.

### `createCheckout(input, { idempotencyKey })`

Choose exactly one of:

- `product_cart`: one to twenty catalog products, each with `product_id` and optional positive integer `quantity`, decimal `amount`, and ad-hoc `pricing`.
- `pricing`: raw pricing containing a three-letter uppercase currency and a decimal string amount for fixed pricing, or `custom`/`free` pricing.

Optional fields include `customer`, `customer_creation`, `billing_currency`, `payment_method_types`, `success_url`, `cancel_url`, `reference`, `expires_in_minutes`, and `metadata`. Types are exported as `CreateCheckoutInput`. Unknown input keys are rejected instead of silently discarded. Return URLs must use HTTPS. Bachs additionally requires publicly accessible destinations and rejects private/loopback addresses. Omit return URLs when testing the overlay on localhost.

An existing customer uses `{ customer_id }`; a new customer uses `{ email, name, phone_number? }`. Subscription products require an identified customer. This library cannot know a product's billing configuration; Bachs enforces catalog-specific rules.

Amounts remain strings throughout. Currency precision, minimum amounts, allowed methods, and catalog eligibility are validated by Bachs. Saved-card setup and connected-account management are outside this helper. Destination split fields described below are unreleased additions.

Returns `CheckoutSession`, preserving additive response fields. Consumers should return only `checkout_url` to the browser.

### Destination split checkout (unreleased)

Choose either the platform's fee or the seller's amount. Both are decimal strings in the sale's base currency, not percentages or minor units:

```ts
const session = await client.createCheckout(
  {
    pricing: { currency: 'USD', amount: '50.00' },
    platform_fee: '1.25',
    transfer_data: { destination: authorizedHost.bachsAccountId },
    reference: order.id,
  },
  { idempotencyKey: order.checkoutIdempotencyKey },
);
```

Alternatively, omit `platform_fee` and send `transfer_data: { destination: authorizedHost.bachsAccountId, amount: '48.75' }`. These fields also work with catalog `product_cart` checkout. A destination requires exactly one split term; supplying neither or both is rejected before transport. A zero platform fee must be explicit, for example `'0.00'`.

Derive the recipient and split from authorized server records. Check the connected account's current eligibility before offering paid bookings. Bachs validates account ownership, eligibility, currency precision, and whether the split fits the final total. The helper does not transfer funds separately, calculate fees, or perform payout onboarding. Processing fees and settlement rules still apply. Do not accept recipient IDs or fees directly from the browser.

### `getCheckoutSession(checkoutId)` (unreleased)

Retrieve a checkout through an authenticated, bodyless GET. Use the `checkout_id` returned by creation and stored with your order, not the short token in `checkout_url`. Requires a Bachs key with `payments:read` permission.

```ts
// Authenticate the caller and authorize this order before retrieving it.
const session = await client.getCheckoutSession(order.bachsCheckoutId);
```

Returns `CheckoutDetails`, which differs from the creation response: there is no required `checkout_url`. It validates the checkout ID, lifecycle status, decimal amount, currency, customer, timestamps, and optional payment/charge details. `customer` and `charge` can be null before payment. Unknown additional fields and status strings are preserved for provider compatibility; never treat an unknown status as success. A response for a different checkout ID is rejected.

Use this for server-side reconciliation alongside signed webhooks. Before changing an order, verify the stored checkout/customer/reference, expected amount and currency, and acceptable payment status according to your application policy, then persist the result idempotently. Checkout completion alone does not prove the application has granted access; refunds and later payment events also need handling. Return only your application's minimal confirmation state to the browser, not the full provider response or customer details.

### `createPortalSession(customerId)`

Returns a fresh `PortalSession` with `id` and `url`. No session URL cache. Authorize the customer on your server first. The URL grants access to that customer's billing portal, so redact it from logs.

### Errors and recovery

`BachsApiError` exposes `code`, HTTP `status`, optional `requestId`, and optional `retryAfter`. Known provider error codes are preserved. Transport failures use `NETWORK_ERROR` or `TIMEOUT` with status `0`; malformed responses use `INVALID_RESPONSE`. Input/configuration failures occur before transport.

A timeout is an **uncertain outcome**, not proof the checkout was never created. Reuse the persisted idempotency key for that order. A 429 may include `retryAfter`. Route handlers should translate errors to suitable HTTP responses without exposing keys, request bodies, portal URLs, or customer data.

## `verifyBachsWebhook(rawBody, options)`

Accepts a string or original `Uint8Array` bytes. It computes HMAC-SHA256 over `timestamp + '.' + raw_body`, then uses a constant-time digest comparison before parsing JSON.

```ts
import { verifyBachsWebhook } from 'bachs-vue/server';

const event = verifyBachsWebhook(rawBytes, {
  secret: process.env.BACHS_WEBHOOK_SECRET!,
  signatureV2: request.headers.get('x-bachs-signature-v2'),
  signature: request.headers.get('x-bachs-signature'),
  timestamp: request.headers.get('x-bachs-timestamp'),
});
```

V2 is preferred when present. An invalid V2 header is rejected even if legacy headers are valid. Multiple `v1=` values are supported for secret rotation. Legacy headers remain supported. The default time tolerance is 300 seconds in either direction; optional `now` is Unix seconds for deterministic tests. Missing secrets, malformed timestamps/signatures, bodies over 1 MiB, and invalid event envelopes throw `BachsWebhookError`.

The returned `BachsWebhookEvent` validates the common envelope. Its `data` is `Record<string, unknown>` deliberately: validate fields relevant to each event before using them. Unknown event types and additive fields do not break verification.

Signature verification is not event deduplication. A valid event can arrive more than once within the tolerance, and Bachs may redeliver it with a new delivery timestamp.

## Durable fulfilment

In a database transaction:

1. Check the event belongs to the expected Bachs organization/account.
2. Insert the provider event ID with a unique constraint.
3. If it already exists, return success without repeating the mutation.
4. Validate the event-specific payment/order data and update business records, or insert a durable processing job in the same transaction.
5. Commit before returning a 2xx response.

Use `collection.succeeded` to confirm a collected payment, and appropriate invoice/subscription events for renewals. A free checkout can complete without collecting payment, so handle free access according to your product policy. Browser events only update presentation. Failed processing should roll back and return non-2xx. For out-of-order subscription events, retrieve current provider state rather than blindly applying an older update.

No in-memory deduplication store is included: it would lose its state on restart and would not coordinate multiple app instances.

## Official references

Contracts were checked against the Bachs docs and OpenAPI specification on 2026-09-21:

- [Checkout retrieval](https://docs.bachs.io/api-reference/checkout-sessions/get-checkout-session)
- [Destination charges](https://docs.bachs.io/connect/split-payments/destination)
- [Overlay checkout](https://docs.bachs.io/guides/checkout/overlay-checkout)
- [Portal sessions](https://docs.bachs.io/guides/customer-portal/create-portal-session)
- [Webhook signatures, V2, and rotation](https://docs.bachs.io/guides/webhooks/overview)
- [Idempotency](https://docs.bachs.io/guides/idempotency)
- [OpenAPI specification](https://docs.bachs.io/docs/openapi/openapi.json)
