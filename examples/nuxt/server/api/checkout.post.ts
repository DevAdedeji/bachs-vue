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
  const url = getRequestURL(event);
  try {
    const session = await useBachsServer(event).createCheckout(
      {
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: config.customerId
          ? { customer_id: config.customerId }
          : { email: config.email, name: config.name },
        success_url: `${url.origin}/?checkout=returned`,
        cancel_url: url.origin,
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
