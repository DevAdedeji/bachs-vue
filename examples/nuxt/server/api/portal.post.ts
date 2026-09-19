import { BachsApiError } from 'bachs-vue/server';
import { requireLocalDemo } from '../utils/demo';

export default defineEventHandler(async (event) => {
  requireLocalDemo(event);
  const customerId = useRuntimeConfig(event).demo.customerId;
  if (!customerId)
    throw createError({
      statusCode: 503,
      statusMessage: 'Configure the sandbox customer ID first',
    });
  try {
    const session = await useBachsServer(event).createPortalSession(customerId);
    return { url: session.url };
  } catch (error) {
    if (error instanceof BachsApiError)
      throw createError({
        statusCode: 502,
        statusMessage: `Bachs request failed: ${error.code}`,
      });
    throw error;
  }
});
