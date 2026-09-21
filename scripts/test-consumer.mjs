import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const major = process.argv[2] ?? '4';
assert(['3', '4'].includes(major), 'Pass Nuxt major 3 or 4.');
const root = new URL('..', import.meta.url).pathname;
const directory = await mkdtemp(join(tmpdir(), `bachs-vue-nuxt${major}-`));
console.log(`Testing the packed package with Nuxt ${major} in ${directory}`);
const { stdout } = await exec(
  'npm',
  ['pack', '--json', '--ignore-scripts', '--pack-destination', directory],
  { cwd: root },
);
const [pack] = JSON.parse(stdout);
await writeFile(
  join(directory, 'package.json'),
  JSON.stringify({
    name: 'bachs-vue-consumer-check',
    private: true,
    type: 'module',
    dependencies: {
      'bachs-vue': `file:./${pack.filename}`,
      nuxt: major === '3' ? '^3.17.0' : '^4.0.0',
      vue: '^3.5.0',
      h3: '^1.15.0',
      typescript: '~5.9.0',
      'vue-tsc': '^3.0.0',
    },
  }),
);
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: directory, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
await run('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline']);
await mkdir(join(directory, 'app'), { recursive: true });
await mkdir(join(directory, 'server/api'), { recursive: true });
await writeFile(
  join(directory, 'nuxt.config.ts'),
  `export default defineNuxtConfig({ modules: ['bachs-vue/nuxt'], compatibilityDate: '2026-09-01', devtools: { enabled: false }, telemetry: false });`,
);
await writeFile(
  join(directory, 'tsconfig.json'),
  '{"extends":"./.nuxt/tsconfig.json"}',
);
const component = `<script setup lang="ts">
const { status } = useBachsCheckout();
const { status: confirmationStatus, start } = useBachsPaymentConfirmation({
  check: (reference, { signal }) => $fetch('/api/confirmation', { query: { reference }, signal }),
});
</script><template><main><h1>Packed consumer</h1><p>{{ status }}</p><p data-testid="confirmation-status">{{ confirmationStatus }}</p><button @click="start('order_fixture')">Check payment</button><BachsCheckoutButton checkout="https://checkout.bachs.io/c/example">Pay</BachsCheckoutButton></main></template>`;
await writeFile(join(directory, 'app.vue'), component);
await writeFile(join(directory, 'app/app.vue'), component);
await writeFile(
  join(directory, 'server/api/config.get.ts'),
  `export default defineEventHandler(event => ({ configured: typeof useBachsServer(event).createCheckout === 'function' && typeof useBachsServer(event).getCheckoutSession === 'function' }));`,
);
await writeFile(
  join(directory, 'server/api/webhook.post.ts'),
  `export default defineEventHandler(event => readBachsWebhook(event));`,
);
await writeFile(
  join(directory, 'server/api/confirmation.get.ts'),
  `import type { PaymentConfirmationResult } from 'bachs-vue';
export default defineEventHandler((event): PaymentConfirmationResult => {
  if (getQuery(event).reference !== 'order_fixture') throw createError({ statusCode: 404 });
  return { status: 'confirmed' };
});`,
);
await run('npx', ['--no-install', 'nuxt', 'typecheck']);
await run('npx', ['--no-install', 'nuxt', 'build']);
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const key = 'sk_sandbox_private_consumer_marker';
const secret = 'whsec_private_consumer_marker';
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: directory,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NITRO_HOST: '127.0.0.1',
    NITRO_PORT: String(port),
    NUXT_BACHS_API_KEY: key,
    NUXT_BACHS_WEBHOOK_SECRET: secret,
  },
});
let serverLogs = '';
server.stdout.on('data', (chunk) => {
  serverLogs += chunk;
});
server.stderr.on('data', (chunk) => {
  serverLogs += chunk;
});
const origin = `http://127.0.0.1:${port}`;
try {
  let response;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null)
      throw new Error(`Consumer server exited: ${serverLogs}`);
    try {
      response = await fetch(origin);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert(response, 'Consumer server did not start.');
  const html = await response.text();
  assert.equal(response.status, 200, html);
  assert(
    html.includes('Packed consumer') &&
      html.includes('idle') &&
      html.includes('Pay'),
  );
  assert(
    !html.includes(key) && !html.includes(secret),
    'Secret leaked into SSR HTML.',
  );
  assert(
    html.includes('data-testid="confirmation-status">idle'),
    'Confirmation must remain idle during SSR.',
  );
  assert.deepEqual(
    await (
      await fetch(`${origin}/api/confirmation?reference=order_fixture`)
    ).json(),
    { status: 'confirmed' },
  );
  assert.equal(
    (await fetch(`${origin}/api/confirmation?reference=unowned`)).status,
    404,
  );
  assert.deepEqual(await (await fetch(`${origin}/api/config`)).json(), {
    configured: true,
  });
  const body = JSON.stringify({
    id: 'evt_packed',
    type: 'collection.succeeded',
    created_at: new Date().toISOString(),
    organization_id: 'acct_test',
    data: {},
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const verified = await fetch(`${origin}/api/webhook`, {
    method: 'POST',
    body,
    headers: { 'x-bachs-signature-v2': `t=${timestamp},v1=${signature}` },
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).id, 'evt_packed');
  assert.equal(
    (await fetch(`${origin}/api/webhook`, { method: 'POST', body })).status,
    400,
  );
  async function scan(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await scan(file);
      else {
        const contents = await readFile(file, 'utf8');
        assert(
          !contents.includes(key) && !contents.includes(secret),
          `Secret leaked into ${file}`,
        );
      }
    }
  }
  await scan(join(directory, '.output/public'));
  const nuxt = JSON.parse(
    await readFile(join(directory, 'node_modules/nuxt/package.json'), 'utf8'),
  );
  console.log(
    `PASS: installed tarball, Nuxt ${nuxt.version} typecheck/build, SSR and confirmation auto-imports, application confirmation endpoint, checkout retrieval export, private configuration, valid/invalid webhooks, and public asset secret scan.`,
  );
} finally {
  server.kill('SIGTERM');
}
