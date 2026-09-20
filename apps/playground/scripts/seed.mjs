import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
const file = new URL('../.env', import.meta.url);
let contents = await readFile(file, 'utf8');
const env = { ...process.env, ...parseEnv(contents) };
if (!/^sk_sandbox_[A-Za-z0-9_-]+$/.test(env.NUXT_BACHS_API_KEY ?? ''))
  throw new Error('Configure a sandbox key in the playground .env.');
async function save(key, value) {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  contents = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}\n${line}\n`;
  await writeFile(file, contents, { mode: 0o600 });
  env[key] = value;
}
const seed = env.DEMO_SEED_ID || randomUUID();
if (!env.DEMO_SEED_ID) await save('DEMO_SEED_ID', seed);
for (const [key, name, recurring] of [
  ['NUXT_DEMO_PRODUCT_ID', 'Bachs Vue Public Demo — One-time', false],
  [
    'NUXT_DEMO_SUBSCRIPTION_PRODUCT_ID',
    'Bachs Vue Public Demo — Monthly',
    true,
  ],
]) {
  if (
    /^prod_[a-z0-9]+$/i.test(env[key] ?? '') &&
    !env[key].includes('replace')
  ) {
    console.log(`${key}: retained`);
    continue;
  }
  const response = await fetch('https://sandbox-api.bachs.io/v1/products', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${env.NUXT_BACHS_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `public_demo_seed_${seed}_${key}`,
    },
    body: JSON.stringify({
      name,
      description: 'Public sandbox demonstration. No real payments.',
      price: { currency: 'USD', price_type: 'fixed', amount: '5.00' },
      ...(recurring
        ? { billing_cycle: { interval: 'month', frequency: 1 } }
        : {}),
      metadata: { integration: 'bachs-vue-public-demo', seed_id: seed },
    }),
  });
  if (!response.ok)
    throw new Error(
      `Product setup failed: HTTP ${response.status}. Retry with the same saved seed.`,
    );
  const product = await response.json();
  if (!/^prod_[a-z0-9]+$/i.test(product.id))
    throw new Error('Invalid product response.');
  await save(key, product.id);
  console.log(`${key}: configured`);
}
