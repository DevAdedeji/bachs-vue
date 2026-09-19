import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyBachsWebhook } from '../src/server/webhooks';

const secret = 'whsec_test';
const timestamp = '1800000000';
const event = {
  id: 'evt_test',
  type: 'collection.succeeded',
  created_at: '2027-01-15T08:00:00Z',
  organization_id: 'acct_test',
  data: { amount: '29.00', currency: 'USD', buyer: 'José' },
  extra: 'future field',
};
const body = JSON.stringify(event, null, 2);
const sign = (payload = body, time = timestamp, key = secret) =>
  createHmac('sha256', key).update(`${time}.${payload}`).digest('hex');
const options = {
  secret,
  timestamp,
  signature: sign(),
  now: Number(timestamp),
};

describe('webhook verification', () => {
  it('verifies exact UTF-8 bytes and preserves additive event fields', () => {
    expect(verifyBachsWebhook(Buffer.from(body), options)).toEqual(event);
    expect(
      verifyBachsWebhook(body, {
        ...options,
        signatureV2: `t=${timestamp},v1=${sign()}`,
      }),
    ).toEqual(event);
  });
  it('accepts any matching V2 signature during secret rotation', () => {
    expect(
      verifyBachsWebhook(body, {
        ...options,
        signatureV2: `t=${timestamp},v1=${sign(body, timestamp, 'old')},v1=${sign()}`,
      }).id,
    ).toBe('evt_test');
  });
  it('rejects body tampering, wrong secrets, and reserialized bodies', () => {
    expect(() =>
      verifyBachsWebhook(body.replace('29.00', '99.00'), options),
    ).toThrow();
    expect(() =>
      verifyBachsWebhook(body, { ...options, secret: 'wrong' }),
    ).toThrow();
    expect(() => verifyBachsWebhook(JSON.stringify(event), options)).toThrow();
  });
  it('rejects stale and future signatures outside the tolerance', () => {
    for (const difference of [-301, 301])
      expect(() =>
        verifyBachsWebhook(body, {
          ...options,
          now: Number(timestamp) + difference,
        }),
      ).toThrow();
    expect(
      verifyBachsWebhook(body, { ...options, now: Number(timestamp) + 299 }).id,
    ).toBe('evt_test');
  });
  it('does not downgrade a malformed V2 header to valid legacy headers', () => {
    for (const signatureV2 of [
      '',
      `t=${timestamp}`,
      `t=${timestamp},t=${timestamp},v1=${sign()}`,
      `t=${timestamp},v1=bad`,
      `t=${timestamp}junk,v1=${sign()}`,
    ]) {
      expect(() =>
        verifyBachsWebhook(body, { ...options, signatureV2 }),
      ).toThrow();
    }
  });
  it('rejects malformed digests, invalid configuration, oversized bodies and missing headers', () => {
    for (const signature of ['', 'zz'.repeat(32), 'a', 'a'.repeat(65)])
      expect(() =>
        verifyBachsWebhook(body, { ...options, signature }),
      ).toThrow();
    expect(() =>
      verifyBachsWebhook(body, { ...options, toleranceSeconds: Infinity }),
    ).toThrow();
    expect(() =>
      verifyBachsWebhook(body, { ...options, secret: '' }),
    ).toThrow();
    expect(() =>
      verifyBachsWebhook(Buffer.alloc(1_048_577), options),
    ).toThrow();
    expect(() => verifyBachsWebhook(body, { secret })).toThrow();
  });
  it('rejects signed invalid JSON or incomplete envelopes', () => {
    for (const invalid of ['{', '{}', JSON.stringify({ ...event, id: '' })])
      expect(() =>
        verifyBachsWebhook(invalid, { ...options, signature: sign(invalid) }),
      ).toThrow();
  });
  it('accepts unknown event types so newly added events do not break delivery', () => {
    const payload = JSON.stringify({ ...event, type: 'future.event' });
    expect(
      verifyBachsWebhook(payload, { ...options, signature: sign(payload) })
        .type,
    ).toBe('future.event');
  });
});
