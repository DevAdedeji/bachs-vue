import { readDemoBody } from '../utils/body';
import { defineEventHandler, createError } from 'h3';
import { z } from 'zod';
import {
  context,
  requireVisitor,
  ensureCustomer,
  demoFailure,
} from '../utils/demo';
const input = z.strictObject({
  plan: z.enum(['one-time', 'subscription']),
  orderId: z.uuid(),
});
export default defineEventHandler(async (event) => {
  const ctx = context(event, true);
  const visitor = requireVisitor(event, ctx);
  const parsed = input.safeParse(await readDemoBody(event));
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      statusMessage: 'Choose a valid sandbox checkout.',
    });
  const { orderId, plan } = parsed.data;
  try {
    const existing = ctx.store.beginOrder(visitor, orderId, plan);
    if (existing) return { checkout_url: existing };
    try {
      const customerId = await ensureCustomer(ctx, visitor);
      const session = await ctx.client.createCheckout(
        {
          product_cart: [
            {
              product_id:
                plan === 'one-time'
                  ? ctx.demo.productId
                  : ctx.demo.subscriptionProductId,
              quantity: 1,
            },
          ],
          customer: { customer_id: customerId },
          reference: `demo_${visitor.id}_${orderId}`,
          expires_in_minutes: 30,
        },
        { idempotencyKey: `public_demo_checkout_${visitor.id}_${orderId}` },
      );
      if (
        new URL(session.checkout_url).origin !==
        'https://sandbox-checkout.bachs.io'
      )
        throw new Error('Unexpected checkout origin');
      ctx.store.saveOrder(visitor, orderId, session.checkout_url);
      return { checkout_url: session.checkout_url };
    } catch (error) {
      ctx.store.releaseOrder(visitor, orderId);
      if (error instanceof Error && 'status' in error && error.status === 409)
        throw error;
      throw createError({
        statusCode: 502,
        statusMessage: 'Could not open sandbox checkout. Please retry shortly.',
      });
    }
  } catch (error) {
    return demoFailure(error);
  }
});
