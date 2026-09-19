import { createError, getHeader, getRequestURL, type H3Event } from 'h3';

/** This local playground deliberately has no production authentication system. */
export function requireLocalDemo(event: H3Event): void {
  if (!import.meta.dev)
    throw createError({
      statusCode: 403,
      statusMessage: 'The playground billing routes are development-only',
    });
  const url = getRequestURL(event);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw createError({
      statusCode: 403,
      statusMessage: 'Local requests only',
    });
  if (getHeader(event, 'origin') !== url.origin)
    throw createError({
      statusCode: 403,
      statusMessage: 'Same-origin request required',
    });
  if (!useRuntimeConfig(event).bachs.apiKey.startsWith('sk_sandbox_'))
    throw createError({
      statusCode: 503,
      statusMessage: 'Configure a sandbox API key first',
    });
}
