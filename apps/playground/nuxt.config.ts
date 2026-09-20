export default defineNuxtConfig({
  modules: ['bachs-vue/nuxt'],
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  runtimeConfig: {
    demo: {
      origin: '',
      dataPath: '',
      mailbox: '',
      productId: '',
      subscriptionProductId: '',
    },
    public: { docsUrl: '' },
  },
  app: {
    head: {
      title: 'bachs-vue · Sandbox playground',
      meta: [
        {
          name: 'description',
          content:
            'Try Bachs checkout and customer billing with the published bachs-vue package. Sandbox payments only.',
        },
      ],
    },
  },
  nitro: { preset: 'node-server' },
});
