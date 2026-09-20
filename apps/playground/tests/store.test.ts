import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DemoStore } from '../lib/store.ts';
import { assertOrigin, customerEmail } from '../lib/policy.ts';

test('sessions are isolated, opaque, and expire', () => {
  let now = 1_800_000_000_000;
  const store = new DemoStore(':memory:', () => now);
  try {
    const a = store.issue();
    const b = store.issue();
    assert.notEqual(a.token, b.token);
    assert.notEqual(a.visitor.id, b.visitor.id);
    store.saveCustomer(a.visitor, 'cust_a');
    assert.equal(store.visitor(a.token)?.customer_id, 'cust_a');
    assert.equal(store.visitor(b.token)?.customer_id, null);
    assert.equal(store.visitor(a.visitor.id), undefined);
    assert.equal(store.visitor(a.token.slice(1)), undefined);
    now += 86_400_001;
    assert.equal(store.visitor(a.token), undefined);
  } finally {
    store.close();
  }
});
test('checkout retries reuse their result and cannot cross visitors or plans', () => {
  let now = 1_800_000_000_000;
  const store = new DemoStore(':memory:', () => now);
  try {
    const a = store.issue().visitor;
    const b = store.issue().visitor;
    assert.equal(store.beginOrder(a, 'order', 'one-time'), null);
    assert.throws(
      () => store.beginOrder(a, 'order', 'one-time'),
      /being prepared/,
    );
    now += 30_001;
    assert.equal(store.beginOrder(a, 'order', 'one-time'), null);
    store.saveOrder(a, 'order', 'https://sandbox-checkout.bachs.io/c/a');
    assert.equal(
      store.beginOrder(a, 'order', 'one-time'),
      'https://sandbox-checkout.bachs.io/c/a',
    );
    assert.throws(
      () => store.beginOrder(a, 'order', 'subscription'),
      /switching plans/,
    );
    assert.equal(store.beginOrder(b, 'order', 'one-time'), null);
  } finally {
    store.close();
  }
});
test('customer provisioning has a lease and returns only the saved customer', () => {
  const store = new DemoStore(':memory:');
  try {
    const a = store.issue().visitor;
    assert.equal(store.claimCustomer(a), null);
    assert.throws(() => store.claimCustomer(a), /being prepared/);
    store.releaseCustomer(a);
    assert.equal(store.claimCustomer(a), null);
    store.saveCustomer(a, 'cust_isolated');
    assert.equal(store.claimCustomer(a), 'cust_isolated');
  } finally {
    store.close();
  }
});
test('checkout quotas survive restarts and retries do not use a new order slot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bachs-demo-test-'));
  const file = join(dir, 'state.sqlite');
  let store = new DemoStore(file);
  try {
    const a = store.issue();
    for (let i = 0; i < 6; i++) {
      store.beginOrder(a.visitor, String(i), 'one-time');
      store.saveOrder(
        a.visitor,
        String(i),
        'https://sandbox-checkout.bachs.io/c/test',
      );
    }
    store.close();
    store = new DemoStore(file);
    const visitor = store.visitor(a.token)!;
    assert.equal(
      store.beginOrder(visitor, '0', 'one-time'),
      'https://sandbox-checkout.bachs.io/c/test',
    );
    assert.throws(() => store.beginOrder(visitor, '7', 'one-time'), /limit/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('new cookies cannot bypass global daily session limits', () => {
  let now = 1_800_000_000_000;
  const store = new DemoStore(':memory:', () => now);
  try {
    for (let i = 0; i < 100; i++) {
      store.issue();
      now += 61_000;
    }
    assert.throws(() => store.issue(), /limit/);
  } finally {
    store.close();
  }
});
test('cross-origin mutations and shared mailbox identities are rejected', () => {
  assert.doesNotThrow(() =>
    assertOrigin('https://demo.example', 'https://demo.example'),
  );
  assert.throws(() => assertOrigin(undefined, 'https://demo.example'));
  assert.throws(() =>
    assertOrigin('https://evil.example', 'https://demo.example'),
  );
  const first = customerEmail(
    'sandbox+old@example.org',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  );
  const second = customerEmail(
    'sandbox+old@example.org',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  );
  assert.notEqual(first, second);
  assert(first.startsWith('sandbox+bv'));
  assert(!first.includes('+old'));
  assert.throws(() => customerEmail('invalid', 'bad'));
});
