import { describe, expect, it, vi } from 'vitest';
import { BachsApiError, createBachsServer } from '../src/server/client';

const input = {
  product_cart: [{ product_id: 'prod_test', quantity: 1 }],
  customer: { email: 'buyer@example.com', name: 'Buyer' },
};
const session = {
  checkout_id: 'chk_test',
  checkout_url: 'https://checkout.bachs.io/c/test',
  status: 'open',
};
const options = { idempotencyKey: 'checkout_order_123' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('Bachs server client', () => {
  it('sends validated checkout and the stable idempotency key to the sandbox', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json({ ...session, future_field: true }, 201));
    const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
    expect(await client.createCheckout(input, options)).toMatchObject(session);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://sandbox-api.bachs.io/v1/checkout-sessions');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk_sandbox_test',
      'Idempotency-Key': options.idempotencyKey,
    });
    expect(JSON.parse(init?.body as string)).toEqual(input);
    expect(init?.redirect).toBe('error');
  });
  it('selects live only for a live key and rejects a key/environment mismatch', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(session));
    await createBachsServer({ apiKey: 'sk_live_test', fetch }).createCheckout(
      input,
      options,
    );
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://api.bachs.io/v1/checkout-sessions',
    );
    expect(() =>
      createBachsServer({ apiKey: 'sk_live_test', environment: 'sandbox' }),
    ).toThrow('do not match');
    expect(() => createBachsServer({ apiKey: '' })).toThrow();
  });
  it('rejects missing idempotency, unsafe redirects, and invalid quantities before transport', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
    await expect(
      client.createCheckout(input, { idempotencyKey: '' }),
    ).rejects.toThrow();
    await expect(
      client.createCheckout(
        { ...input, success_url: 'javascript:alert(1)' },
        options,
      ),
    ).rejects.toThrow();
    await expect(
      client.createCheckout(
        { product_cart: [{ product_id: 'prod_test', quantity: 0 }] },
        options,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves decimal strings and rejects numeric money and mixed pricing', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(session));
    const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
    await client.createCheckout(
      { pricing: { currency: 'NGN', amount: '12000.00' } },
      options,
    );
    expect(
      JSON.parse(fetch.mock.calls[0]![1]?.body as string).pricing.amount,
    ).toBe('12000.00');
    await expect(
      client.createCheckout(
        // @ts-expect-error Numeric amounts must fail at compile time and runtime.
        { pricing: { currency: 'NGN', amount: 12000 } },
        options,
      ),
    ).rejects.toThrow();
    await expect(
      client.createCheckout(
        { ...input, pricing: { currency: 'USD', amount: '10.00' } },
        options,
      ),
    ).rejects.toThrow();
  });
  it('creates a fresh portal session for a validated customer ID', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () =>
        json({ id: 'psn_test', url: 'https://portal.bachs.io/s/test' }),
      );
    const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
    await client.createPortalSession('cust_test');
    await client.createPortalSession('cust_test');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![0]).toContain(
      '/v1/customers/cust_test/portal-sessions',
    );
    expect(fetch.mock.calls[0]![1]?.body).toBeUndefined();
    await expect(
      client.createPortalSession('../someone-else'),
    ).rejects.toThrow();
  });
  it('does not retry ambiguous failures or disclose provider detail and credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      json(
        {
          error_code: 'SERVICE_UNAVAILABLE',
          detail: 'secret sk_sandbox_test',
        },
        503,
      ),
    );
    const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
    const error = await client
      .createCheckout(input, options)
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(BachsApiError);
    expect(error).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(JSON.stringify(error)).not.toContain('sk_sandbox_test');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed and unsafe provider responses', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ checkout_url: session.checkout_url }))
      .mockResolvedValueOnce(
        json({ ...session, checkout_url: 'javascript:alert(1)' }),
      )
      .mockResolvedValueOnce(new Response('not json'));
    const client = createBachsServer({ apiKey: 'sk_sandbox_test', fetch });
    for (let i = 0; i < 3; i++)
      await expect(client.createCheckout(input, options)).rejects.toMatchObject(
        { code: 'INVALID_RESPONSE' },
      );
  });
  it('aborts timed out requests and reports an uncertain outcome', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const client = createBachsServer({
      apiKey: 'sk_sandbox_test',
      timeoutMs: 5,
      fetch,
    });
    await expect(client.createCheckout(input, options)).rejects.toMatchObject({
      code: 'TIMEOUT',
      status: 0,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
