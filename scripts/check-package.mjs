import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createBachs, BachsCheckoutButton } from '../dist/index.js';
import { createBachsServer, verifyBachsWebhook } from '../dist/server/index.js';
assert.equal(createBachs().checkout.status.value, 'idle');
assert.equal(BachsCheckoutButton.name, 'BachsCheckoutButton');
assert.equal(typeof createBachsServer, 'function');
assert.equal(typeof verifyBachsWebhook, 'function');
const client = await readFile(
  new URL('../dist/index.js', import.meta.url),
  'utf8',
);
assert(!client.includes('node:crypto'));
assert(!client.includes('Bearer '));
assert(!client.includes('createBachsServer'));
const plugin = await readFile(
  new URL('../dist/nuxt/runtime/plugin.js', import.meta.url),
  'utf8',
);
assert(
  plugin.includes('from "bachs-vue"'),
  'Nuxt and Vue must share the same plugin injection key',
);
const [pack] = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
  }),
);
const paths = pack.files.map((file) => file.path);
for (const file of [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/nuxt/module.js',
  'dist/nuxt/runtime/plugin.js',
  'dist/nuxt/runtime/server.js',
  'dist/server/index.js',
  'dist/server/browser.js',
  'README.md',
  'LICENSE',
])
  assert(paths.includes(file), `Missing package file: ${file}`);
assert(
  !paths.some(
    (path) =>
      path.includes('.env') ||
      path.startsWith('tests/') ||
      path.startsWith('examples/') ||
      path.startsWith('apps/') ||
      path.includes('.vitepress/') ||
      path.startsWith('docs/public/'),
  ),
);
assert((await readdir(new URL('../dist', import.meta.url))).length > 0);
console.log(
  `Package imports, browser boundary, Nuxt plugin identity, and ${paths.length} packed files verified.`,
);
