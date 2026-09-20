import { z } from 'zod';
import { BachsApiError } from 'bachs-vue/server';
import { requireLocalDemo } from '../utils/demo';

export default defineEventHandler(async (event) => {
  requireLocalDemo(event);
  const body = await readValidatedBody(
    event,
    z.object({ plan: z.enum(['one-time', 'subscription']), orderId: z.uuid() })
      .parse,
  );
  const config = useRuntimeConfig(event).demo;
  const productId =
    body.plan === 'one-time' ? config.productId : config.subscriptionProductId;
  if (!productId)
    throw createError({
      statusCode: 503,
      statusMessage: 'Configure the sandbox product ID first',
    });
  const customer = config.customerId
    ? { customer_id: config.customerId }
    : config.email && !/@example\.(com|net|org)$/i.test(config.email)
      ? { email: config.email, name: config.name }
      : undefined;
  if (body.plan === 'subscription' && !customer)
    throw createError({
      statusCode: 503,
      statusMessage:
        'Configure a sandbox customer ID or deliverable email for subscriptions',
    });
  try {
    const session = await useBachsServer(event).createCheckout(
      {
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer,
        reference: body.orderId,
      },
      { idempotencyKey: `demo_${body.plan}_${body.orderId}` },
    );
    return { checkout_url: session.checkout_url };
  } catch (error) {
    if (error instanceof BachsApiError)
      throw createError({
        statusCode: 502,
        statusMessage: `Bachs request failed: ${error.code}`,
      });
    throw error;
  }
});
