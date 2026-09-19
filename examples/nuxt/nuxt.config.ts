export default defineNuxtConfig({
  modules: ['bachs-vue/nuxt'],
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  runtimeConfig: {
    demo: {
      productId: '',
      subscriptionProductId: '',
      customerId: '',
      email: '',
      name: 'Sandbox Buyer',
    },
  },
  app: {
    head: {
      title: 'Bachs + Nuxt · Billing playground',
      meta: [
        {
          name: 'description',
          content: 'A sandbox playground for bachs-vue checkout and billing.',
        },
      ],
    },
  },
});
