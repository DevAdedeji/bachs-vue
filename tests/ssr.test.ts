import { expect, it, vi } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createBachs } from '../src/vue/client';
import { useBachsCheckout } from '../src/vue/composables';
import { loadBachs } from '@bachs/js';
vi.mock('@bachs/js', () => ({ loadBachs: vi.fn() }));
it('renders on the server without loading browser scripts or sharing request state', async () => {
  const first = createBachs();
  const second = createBachs();
  const app = createSSRApp(
    defineComponent({
      setup() {
        const { status } = useBachsCheckout();
        return () => h('span', status.value);
      },
    }),
  );
  app.use(first);
  expect(await renderToString(app)).toBe('<span>idle</span>');
  expect(loadBachs).not.toHaveBeenCalled();
  await expect(
    first.checkout.open('https://checkout.bachs.io/c/test'),
  ).rejects.toThrow('SSR');
  first.checkout.close();
  expect(second.checkout.status.value).toBe('idle');
});
