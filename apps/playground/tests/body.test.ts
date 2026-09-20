import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createApp, defineEventHandler, toNodeListener } from 'h3';
import { readDemoBody } from '../server/utils/body.ts';

test('body reader accepts JSON and rejects invalid, oversized and chunked oversized requests', async () => {
  const app = createApp();
  app.use(defineEventHandler((event) => readDemoBody(event)));
  const server = createServer(toNodeListener(app));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    let response = await fetch(url, {
      method: 'POST',
      body: '{"plan":"one-time"}',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { plan: 'one-time' });
    response = await fetch(url, {
      method: 'POST',
      body: 'broken',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 400);
    response = await fetch(url, {
      method: 'POST',
      body: 'x'.repeat(1500),
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 413);
    response = await fetch(url, { method: 'POST', body: '{}' });
    assert.equal(response.status, 415);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'transfer-encoding': 'chunked',
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.write('x'.repeat(800));
      req.end('x'.repeat(800));
    });
    assert.equal(status, 413);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
