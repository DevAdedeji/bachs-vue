import {
  addComponent,
  addImports,
  addPlugin,
  addServerImports,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit';
import type { BachsOptions } from '../vue/client';

export interface ModuleOptions extends BachsOptions {
  components?: boolean;
}
export interface BachsRuntimeConfig {
  apiKey: string;
  webhookSecret: string;
  timeoutMs: number;
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    bachs: BachsRuntimeConfig;
  }
  interface PublicRuntimeConfig {
    bachs: BachsOptions;
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'bachs-vue',
    configKey: 'bachs',
    compatibility: { nuxt: '^3.17.0 || ^4.0.0' },
  },
  defaults: { components: true, loadTimeoutMs: 15_000 },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    const existing = nuxt.options.runtimeConfig.bachs;
    nuxt.options.runtimeConfig.bachs = {
      apiKey: existing?.apiKey ?? '',
      webhookSecret: existing?.webhookSecret ?? '',
      timeoutMs: existing?.timeoutMs ?? 10_000,
    };
    // Explicit allowlist: arbitrary module options must never become public config.
    nuxt.options.runtimeConfig.public.bachs = {
      checkoutOrigin: options.checkoutOrigin,
      loadTimeoutMs: options.loadTimeoutMs,
    };
    addPlugin(resolver.resolve('./runtime/plugin'));
    addImports(
      ['useBachsCheckout', 'useBachsPortal', 'useBachsPaymentConfirmation'].map(
        (name) => ({
          name,
          from: resolver.resolve('../index.js'),
        }),
      ),
    );
    if (options.components)
      addComponent({
        name: 'BachsCheckoutButton',
        export: 'BachsCheckoutButton',
        filePath: resolver.resolve('../index.js'),
      });
    addServerImports(
      ['useBachsServer', 'readBachsWebhook'].map((name) => ({
        name,
        from: resolver.resolve('./runtime/server'),
      })),
    );
  },
});
