import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandboxCustomerId } from '../lib/customer.ts';

test('Bachs customer_id responses bind only to the expected visitor email', () => {
  const response = {
    customer_id: 'cust_sandbox_visitor',
    email: 'sandbox+bvtest@example.org',
    name: 'Sandbox Visitor',
  };
  assert.equal(
    sandboxCustomerId(response, 'sandbox+bvtest@example.org'),
    'cust_sandbox_visitor',
  );
  assert.throws(() => sandboxCustomerId(response, 'another@example.org'));
  assert.throws(() =>
    sandboxCustomerId(
      { id: response.customer_id, email: response.email },
      response.email,
    ),
  );
  assert.throws(() =>
    sandboxCustomerId({ ...response, customer_id: 'invalid' }, response.email),
  );
});
