import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import {
  createApp,
  defineEventHandler,
  toNodeListener,
  toWebHandler,
} from 'h3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBachsWebhook, useBachsServer } from '../src/nuxt/runtime/server';
const config = vi.hoisted(() => ({
  bachs: {
    apiKey: 'sk_sandbox_test',
    webhookSecret: 'whsec_test',
    timeoutMs: 1000,
  },
}));
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => config }));
const now = Math.floor(Date.now() / 1000);
const payload = JSON.stringify({
  id: 'evt_test',
  type: 'collection.succeeded',
  created_at: new Date().toISOString(),
  organization_id: 'acct_test',
  data: {},
});
const signature = createHmac('sha256', config.bachs.webhookSecret)
  .update(`${now}.${payload}`)
  .digest('hex');
const headers = {
  'content-type': 'application/json',
  'x-bachs-signature-v2': `t=${now},v1=${signature}`,
};
afterEach(() => {
  config.bachs.webhookSecret = 'whsec_test';
});
function app() {
  return createApp().use(
    defineEventHandler((event) => readBachsWebhook(event)),
  );
}

describe('Nuxt server helpers through H3', () => {
  it('verifies a real web request and maps verification failures to HTTP 400', async () => {
    const handle = toWebHandler(app());
    const valid = await handle(
      new Request('http://localhost/webhook', {
        method: 'POST',
        body: payload,
        headers,
      }),
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ id: 'evt_test' });
    const bad = await handle(
      new Request('http://localhost/webhook', {
        method: 'POST',
        body: payload,
        headers: { 'x-bachs-signature-v2': 'bad' },
      }),
    );
    expect(bad.status).toBe(400);
  });
  it('rejects GET, empty bodies, and oversize streamed bodies', async () => {
    const handle = toWebHandler(app());
    expect((await handle(new Request('http://localhost/webhook'))).status).toBe(
      405,
    );
    expect(
      (
        await handle(
          new Request('http://localhost/webhook', {
            method: 'POST',
            body: '',
            headers,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handle(
          new Request('http://localhost/webhook', {
            method: 'POST',
            body: 'x'.repeat(1_048_577),
            headers,
          }),
        )
      ).status,
    ).toBe(413);
  });
  it('rejects declared oversize bodies before reading them', async () => {
    const result = await toWebHandler(app())(
      new Request('http://localhost/webhook', {
        method: 'POST',
        body: 'small',
        headers: { ...headers, 'content-length': '1048577' },
      }),
    );
    expect(result.status).toBe(413);
  });
  it('fails closed if the webhook secret is missing', async () => {
    config.bachs.webhookSecret = '';
    const result = await toWebHandler(app())(
      new Request('http://localhost/webhook', {
        method: 'POST',
        body: payload,
        headers,
      }),
    );
    expect(result.status).toBe(500);
  });
  it('uses request runtime config to construct the server client', async () => {
    const handle = toWebHandler(
      createApp().use(
        defineEventHandler((event) => ({
          configured:
            typeof useBachsServer(event).createCheckout === 'function',
        })),
      ),
    );
    expect(
      await (await handle(new Request('http://localhost/test'))).json(),
    ).toEqual({ configured: true });
  });
  it('verifies raw Node requests and handles an oversized upload without crashing', async () => {
    const server = createServer(toNodeListener(app()));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing test port');
      const url = `http://127.0.0.1:${address.port}`;
      expect(
        (await fetch(url, { method: 'POST', body: payload, headers })).status,
      ).toBe(200);
      const stream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < 20; i++)
            controller.enqueue(new Uint8Array(65_536));
          controller.close();
        },
      });
      const response = await fetch(url, {
        method: 'POST',
        body: stream,
        duplex: 'half',
      } as RequestInit);
      expect(response.status).toBe(413);
      expect(
        (await fetch(url, { method: 'POST', body: payload, headers })).status,
      ).toBe(200);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
