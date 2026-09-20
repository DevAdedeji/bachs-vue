// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { loadBachs, type Bachs, type BachsCheckoutOpenArgs } from '@bachs/js';
import { createBachs } from '../src/vue/client';
import { useBachsCheckout, useBachsPortal } from '../src/vue/composables';
import { BachsCheckoutButton } from '../src/vue/BachsCheckoutButton';

vi.mock('@bachs/js', () => ({ loadBachs: vi.fn() }));
const url = 'https://checkout.bachs.io/c/test';
let args: BachsCheckoutOpenArgs | undefined;
let visible = false;
const sdk: Bachs = {
  version: 'test',
  Initialize: vi.fn(() => sdk),
  Checkout: {
    open: vi.fn(async (input) => {
      args = input;
      visible = true;
      input.onEvent?.({ type: 'checkout.opened', data: {} });
      return { close: sdk.Checkout.close };
    }),
    close: vi.fn(() => {
      visible = false;
      args?.onEvent?.({ type: 'checkout.closed', data: {} });
    }),
    isOpen: () => visible,
  },
};
const clients: ReturnType<typeof createBachs>[] = [];
function client() {
  const value = createBachs();
  clients.push(value);
  vi.mocked(loadBachs).mockResolvedValue(sdk);
  return value;
}
afterEach(() => {
  clients.forEach((value) => value.checkout.close());
  clients.length = 0;
  args = undefined;
  visible = false;
  vi.clearAllMocks();
});

describe('Vue checkout', () => {
  it('selects the official sandbox origin from the checkout URL', async () => {
    const bachs = client();
    await bachs.checkout.open('https://sandbox-checkout.bachs.io/c/test');
    expect(loadBachs).toHaveBeenCalledWith({
      baseUrl: 'https://sandbox-checkout.bachs.io',
    });
    expect(sdk.Initialize).toHaveBeenCalledWith({
      baseUrl: 'https://sandbox-checkout.bachs.io',
    });
  });
  it('rejects an unexpected checkout host before loading a remote script', async () => {
    const bachs = client();
    await expect(
      bachs.checkout.open('https://attacker.example/c/test'),
    ).rejects.toThrow('trusted Bachs');
    expect(loadBachs).not.toHaveBeenCalled();
  });

  it('loads lazily, prevents duplicate session creation, and shares busy state', async () => {
    const bachs = client();
    expect(loadBachs).not.toHaveBeenCalled();
    let resolve!: (value: string) => void;
    const source = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const first = bachs.checkout.open(source);
    await bachs.checkout.open(source);
    expect(source).toHaveBeenCalledTimes(1);
    expect(bachs.checkout.isLoading.value).toBe(true);
    resolve(url);
    await first;
    expect(bachs.checkout.status.value).toBe('open');
    expect(bachs.checkout.isBusy.value).toBe(true);
    args?.onEvent?.({
      type: 'checkout.completed',
      data: { reference: 'order_1' },
    });
    args?.onEvent?.({ type: 'checkout.closed', data: {} });
    visible = false;
    expect(bachs.checkout.status.value).toBe('completed');
    expect(bachs.checkout.isBusy.value).toBe(false);
  });
  it.each(['completed', 'failed', 'expired'] as const)(
    'retains %s when late readiness events arrive before closing',
    async (outcome) => {
      const bachs = client();
      await bachs.checkout.open(url);
      args?.onEvent?.({ type: `checkout.${outcome}`, data: {} });
      for (const type of [
        'checkout.loaded',
        'checkout.ready',
        'checkout.opened',
      ] as const) {
        args?.onEvent?.({ type, data: {} });
        expect(bachs.checkout.status.value).toBe(outcome);
      }
      sdk.Checkout.close();
      expect(bachs.checkout.status.value).toBe(outcome);
      expect(bachs.checkout.isBusy.value).toBe(false);
    },
  );
  it('ignores callbacks from a closed overlay and allows a new checkout', async () => {
    const bachs = client();
    const listener = vi.fn();
    bachs.subscribe(listener);
    await bachs.checkout.open(url);
    const oldHandler = args?.onEvent;
    sdk.Checkout.close();
    listener.mockClear();
    oldHandler?.({ type: 'checkout.loaded', data: {} });
    expect(bachs.checkout.status.value).toBe('closed');
    expect(bachs.checkout.isBusy.value).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    await bachs.checkout.open(url);
    oldHandler?.({ type: 'checkout.completed', data: {} });
    expect(bachs.checkout.status.value).toBe('open');
  });
  it('does not open a checkout after cancellation while the server responds', async () => {
    const bachs = client();
    let resolve!: (value: string) => void;
    const promise = bachs.checkout.open(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    bachs.checkout.close();
    resolve(url);
    await promise;
    expect(sdk.Checkout.open).not.toHaveBeenCalled();
  });
  it('allows recovery after a failed session request and ignores stale events', async () => {
    const bachs = client();
    await expect(
      bachs.checkout.open(() => Promise.reject(new Error('Offline'))),
    ).rejects.toThrow('Offline');
    expect(bachs.checkout.status.value).toBe('error');
    await bachs.checkout.open(url);
    const oldHandler = args?.onEvent;
    bachs.checkout.close();
    await bachs.checkout.open(url);
    oldHandler?.({ type: 'checkout.failed', data: {} });
    expect(bachs.checkout.status.value).toBe('open');
  });
  it('prevents separate Vue apps from opening competing overlays', async () => {
    const first = client();
    const second = client();
    await first.checkout.open(url);
    await expect(second.checkout.open(url)).rejects.toThrow('already active');
    first.checkout.close();
    await second.checkout.open(url);
    expect(second.checkout.isOpen.value).toBe(true);
  });
  it('releases the lock after SDK load errors or timeout', async () => {
    const bachs = client();
    vi.mocked(loadBachs).mockRejectedValueOnce(new Error('Script blocked'));
    await expect(bachs.checkout.open(url)).rejects.toThrow('Script blocked');
    expect(bachs.checkout.isBusy.value).toBe(false);
    const timed = createBachs({ loadTimeoutMs: 5 });
    clients.push(timed);
    vi.mocked(loadBachs).mockImplementationOnce(() => new Promise(() => {}));
    await expect(timed.checkout.open(url)).rejects.toThrow('in time');
    await bachs.checkout.open(url);
    expect(bachs.checkout.status.value).toBe('open');
  });
  it('removes scoped event handlers when their component unmounts', async () => {
    const bachs = client();
    const listener = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          useBachsCheckout({ onEvent: listener });
          return () => h('div');
        },
      }),
      { global: { plugins: [bachs] } },
    );
    await bachs.checkout.open(url);
    wrapper.unmount();
    listener.mockClear();
    args?.onEvent?.({ type: 'checkout.completed', data: {} });
    expect(listener).not.toHaveBeenCalled();
  });
  it('renders an accessible customizable button and reports creation errors', async () => {
    const bachs = client();
    const wrapper = mount(BachsCheckoutButton, {
      props: {
        checkout: async () => {
          throw new Error('Server unavailable');
        },
      },
      attrs: { class: 'pay' },
      slots: { default: 'Subscribe' },
      global: { plugins: [bachs] },
    });
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.classes()).toContain('pay');
    expect(wrapper.text()).toBe('Subscribe');
    await wrapper.trigger('click');
    await flushPromises();
    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(Error);
    expect(wrapper.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('does not redirect a disposed portal component after its request completes', async () => {
    let portal!: ReturnType<typeof useBachsPortal>;
    const wrapper = mount(
      defineComponent({
        setup() {
          portal = useBachsPortal();
          return () => h('div');
        },
      }),
    );
    let resolve!: (value: string) => void;
    const assign = vi
      .spyOn(window.location, 'assign')
      .mockImplementation(() => {});
    const promise = portal.open(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    wrapper.unmount();
    resolve('https://portal.bachs.io/s/test');
    await promise;
    expect(assign).not.toHaveBeenCalled();
  });
});
