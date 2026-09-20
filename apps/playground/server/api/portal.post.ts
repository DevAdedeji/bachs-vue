import { defineEventHandler, createError } from 'h3';
import { context, requireVisitor, demoFailure } from '../utils/demo';
export default defineEventHandler(async (event) => {
  const ctx = context(event, true);
  const visitor = requireVisitor(event, ctx);
  if (!visitor.customer_id)
    throw createError({
      statusCode: 409,
      statusMessage:
        'Start a checkout in this browser before opening its billing portal.',
    });
  try {
    ctx.store.allowPortal(visitor);
  } catch (error) {
    return demoFailure(error);
  }
  try {
    const session = await ctx.client.createPortalSession(visitor.customer_id);
    return { url: session.url };
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not open the sandbox portal. Please retry shortly.',
    });
  }
});
