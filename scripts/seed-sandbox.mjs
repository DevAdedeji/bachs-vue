import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const file = new URL('../examples/nuxt/.env', import.meta.url);
const env = parseEnv(await readFile(file, 'utf8'));
const apiKey = env.NUXT_BACHS_API_KEY ?? '';
if (
  !/^sk_sandbox_[A-Za-z0-9_-]+$/.test(apiKey) ||
  apiKey.includes('replace_me')
) {
  throw new Error(
    'Configure a real sandbox key in examples/nuxt/.env. Live keys are refused.',
  );
}
async function save(name, value) {
  const contents = await readFile(file, 'utf8');
  const line = `${name}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  await writeFile(
    file,
    pattern.test(contents)
      ? contents.replace(pattern, () => line)
      : `${contents.trimEnd()}\n${line}\n`,
    { mode: 0o600 },
  );
  env[name] = value;
}
const customerEmail = env.NUXT_DEMO_EMAIL?.trim();
if (
  !env.NUXT_DEMO_CUSTOMER_ID &&
  (!customerEmail || /@example\.(com|net|org)$/i.test(customerEmail))
) {
  throw new Error(
    'Set NUXT_DEMO_EMAIL to an email you control. Bachs requires a deliverable email even in sandbox.',
  );
}
const seedId = env.BACHS_DEMO_SEED_ID || randomUUID();
await save('BACHS_DEMO_SEED_ID', seedId);
async function create(path, body, operation) {
  const response = await fetch(`https://sandbox-api.bachs.io/v1/${path}`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `bachs_vue_${seedId}_${operation}`,
    },
    body: JSON.stringify(body),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `${operation}: invalid response, HTTP ${response.status}. Re-run with the same seed ID.`,
    );
  }
  if (!response.ok) {
    const code =
      typeof payload.error_code === 'string' &&
      /^[A-Z0-9_]+$/.test(payload.error_code)
        ? payload.error_code
        : 'API_ERROR';
    throw new Error(
      `${operation}: HTTP ${response.status} ${code}. Check sandbox API permissions; no response details or credentials were logged.`,
    );
  }
  return payload;
}
for (const plan of [
  {
    key: 'NUXT_DEMO_PRODUCT_ID',
    operation: 'one_time',
    name: 'Bachs Vue Sandbox — One-time',
    cadence: undefined,
  },
  {
    key: 'NUXT_DEMO_SUBSCRIPTION_PRODUCT_ID',
    operation: 'subscription',
    name: 'Bachs Vue Sandbox — Monthly',
    cadence: { interval: 'month', frequency: 1 },
  },
]) {
  if (
    env[plan.key]?.startsWith('prod_') &&
    !env[plan.key].includes('replace_me')
  ) {
    console.log(`${plan.operation}: existing configured product retained.`);
    continue;
  }
  const product = await create(
    'products',
    {
      name: plan.name,
      description:
        'Sandbox fixture for the bachs-vue integration. No live funds.',
      price: { currency: 'USD', price_type: 'fixed', amount: '5.00' },
      ...(plan.cadence ? { billing_cycle: plan.cadence } : {}),
      metadata: { integration: 'bachs-vue', seed_id: seedId },
    },
    plan.operation,
  );
  if (typeof product.id !== 'string' || !product.id.startsWith('prod_'))
    throw new Error(
      'Unexpected product response. Re-run with the saved idempotency key; do not reset the seed ID.',
    );
  await save(plan.key, product.id);
  console.log(`${plan.operation}: created and saved ${product.id}.`);
}
if (env.NUXT_DEMO_CUSTOMER_ID?.startsWith('cust_')) {
  console.log('customer: existing configured customer retained.');
} else {
  const customer = await create(
    'customers',
    {
      email: customerEmail,
      name: 'Bachs Vue Sandbox Customer',
      metadata: { integration: 'bachs-vue', seed_id: seedId },
    },
    `customer_${createHash('sha256').update(customerEmail).digest('hex').slice(0, 16)}`,
  );
  if (
    typeof customer.customer_id !== 'string' ||
    !customer.customer_id.startsWith('cust_')
  )
    throw new Error(
      'Unexpected customer response. Re-run with the saved idempotency key.',
    );
  await save('NUXT_DEMO_CUSTOMER_ID', customer.customer_id);
  console.log(`customer: created and saved ${customer.customer_id}.`);
}
console.log(
  'Sandbox fixtures are ready. Restart the Nuxt dev server to load the updated .env.',
);
