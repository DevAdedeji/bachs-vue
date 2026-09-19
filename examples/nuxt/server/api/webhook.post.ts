export default defineEventHandler(async (event) => {
  if (!import.meta.dev)
    throw createError({
      statusCode: 403,
      statusMessage: 'The example webhook is development-only',
    });
  const notification = await readBachsWebhook(event);
  // This playground observes verified events only. It grants no access and stores no orders.
  console.info('Verified Bachs event', {
    id: notification.id,
    type: notification.type,
  });
  setResponseStatus(event, 204);
  return null;
});
