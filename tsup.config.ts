import { defineConfig } from 'tsup';
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server/index.ts',
    'src/server/browser.ts',
    'src/nuxt/module.ts',
    'src/nuxt/runtime/plugin.ts',
    'src/nuxt/runtime/server.ts',
  ],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: [
    'bachs-vue',
    'vue',
    '@bachs/js',
    '@nuxt/kit',
    '#app',
    'nitropack/runtime',
    'h3',
    'zod',
  ],
});
