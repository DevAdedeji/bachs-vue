import { describe, expect, it, vi } from 'vitest';
import { createBachsServer } from '../src/server/client';
import type { CreateCheckoutInput, CheckoutDetails } from '../src/server';

const created = {
  checkout_id: 'chk_order',
  checkout_url: 'https://sandbox-checkout.bachs.io/c/example',
  status: 'open',
};
const details = {
  checkout_id: 'chk_order',
  status: 'open',
  payment_status: null,
  amount: '50.00',
  currency: 'USD',
  customer: null,
  charge: null,
  created_at: '2026-09-21T12:00:00Z',
  updated_at: '2026-09-21T12:00:00Z',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const key = { idempotencyKey: 'order_split_1' };

describe('destination checkout', () => {
  it.each([
    { platform_fee: '1.25', transfer_data: { destination: 'acct_host' } },
    { platform_fee: '0.00', transfer_data: { destination: 'acct_host' } },
    { transfer_data: { destination: 'acct_host', amount: '48.75' } },
  ])(
    'preserves the split amounts and retry key for both pricing modes: %j',
    async (split) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => json(created, 201));
      const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
      for (const pricing of [
        { pricing: { currency: 'USD', amount: '50.00' } },
        { product_cart: [{ product_id: 'prod_test' }] },
      ]) {
        const input = { ...pricing, ...split };
        await client.createCheckout(input, key);
        await client.createCheckout(input, key);
        const init = fetch.mock.lastCall![1]!;
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual(input);
        expect(init.headers).toMatchObject({
          'Idempotency-Key': key.idempotencyKey,
        });
      }
    },
  );
  it.each([
    { transfer_data: { destination: 'acct_host' } },
    {
      platform_fee: '1.25',
      transfer_data: { destination: 'acct_host', amount: '48.75' },
    },
    { platform_fee: '1.25', transfer_data: { destination: '../host' } },
    { platform_fee: '-1', transfer_data: { destination: 'acct_host' } },
    { platform_fee: '1e2', transfer_data: { destination: 'acct_host' } },
    { platform_fee: 1.25, transfer_data: { destination: 'acct_host' } },
    { transfer_data: { destination: 'acct_host', amount: -1 } },
    {
      transfer_data: { destination: 'acct_host', amount: '1.00', extra: true },
    },
  ])(
    'rejects ambiguous or malformed splits before making a payment request: %j',
    async (split) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
      // Deliberately exercise untrusted runtime input, including numeric money.
      const input = {
        pricing: { currency: 'USD', amount: '50.00' },
        ...split,
      } as CreateCheckoutInput;
      await expect(client.createCheckout(input, key)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe('checkout retrieval', () => {
  it('uses a bodyless authenticated GET and accepts unpaid checkouts without a checkout URL', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(details));
    const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
    const session: CheckoutDetails =
      await client.getCheckoutSession('chk_order');
    expect(session).toEqual(details);
    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox-api.bachs.io/v1/checkout-sessions/chk_order',
      expect.objectContaining({
        method: 'GET',
        body: undefined,
        redirect: 'error',
      }),
    );
    expect(fetch.mock.calls[0]![1]?.headers).toEqual({
      Authorization: 'Bearer sk_sandbox_test',
      Accept: 'application/json',
    });
  });
  it('preserves paid details and additive provider fields without interpreting them as fulfilment', async () => {
    const paid = {
      ...details,
      status: 'completed',
      payment_status: 'succeeded',
      customer: { id: 'cust_buyer', email: 'buyer@example.org', name: 'Buyer' },
      charge: {
        payment_id: 'pay_test',
        status: 'succeeded',
        amount: '50.00',
        currency: 'USD',
      },
      platform_fee: '1.25',
      metadata: { order: 'order_1' },
      future_field: true,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(paid));
    expect(
      await createBachsServer({
        apiKey: 'sk_live_test',
        fetch,
      }).getCheckoutSession('chk_order'),
    ).toEqual(paid);
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://api.bachs.io/v1/checkout-sessions/chk_order',
    );
  });
  it.each([
    '',
    '../other',
    'chk_a/b',
    'chk_a?x=y',
    'chk_%2f',
    'chk_\nsecret',
    'a'.repeat(256),
  ])('rejects unsafe checkout ID %j before transport', async (id) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      createBachsServer({
        apiKey: 'sk_sandbox_test',
        fetch,
      }).getCheckoutSession(id),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { ...details, checkout_id: 'chk_another_order' },
    { ...details, amount: 50 },
    { ...details, currency: null },
    { ...details, charge: { status: 'succeeded' } },
    created,
  ])('rejects mismatched or malformed retrieval responses', async (body) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(body));
    await expect(
      createBachsServer({
        apiKey: 'sk_sandbox_test',
        fetch,
      }).getCheckoutSession('chk_order'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it.each([403, 404, 429, 503])(
    'preserves HTTP %i errors without leaking or retrying',
    async (status) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error_code: 'PROVIDER_ERROR',
              detail: 'private provider data',
            }),
            {
              status,
              headers: { 'x-request-id': 'req_test', 'retry-after': '5' },
            },
          ),
        );
      const error = await createBachsServer({
        apiKey: 'sk_sandbox_test',
        fetch,
      })
        .getCheckoutSession('chk_order')
        .catch((error) => error);
      expect(error).toMatchObject({
        status,
        code: 'PROVIDER_ERROR',
        requestId: 'req_test',
        retryAfter: '5',
      });
      expect(JSON.stringify(error)).not.toContain('private provider data');
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('bounds retrieval time and aborts its transport', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      );
    await expect(
      createBachsServer({
        apiKey: 'sk_sandbox_test',
        fetch,
        timeoutMs: 5,
      }).getCheckoutSession('chk_order'),
    ).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
    expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });
});
