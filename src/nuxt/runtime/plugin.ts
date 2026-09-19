import { defineNuxtPlugin, useRuntimeConfig } from '#app';
import { createBachs } from 'bachs-vue';
export default defineNuxtPlugin({
  name: 'bachs-vue',
  setup(nuxtApp) {
    nuxtApp.vueApp.use(createBachs(useRuntimeConfig().public.bachs));
  },
});
