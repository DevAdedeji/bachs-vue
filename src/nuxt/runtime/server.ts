import { useRuntimeConfig } from 'nitropack/runtime';
import { createError, getHeader, type H3Event } from 'h3';
import { createBachsServer, type BachsServer } from '../../server/client';
import { BachsWebhookError, verifyBachsWebhook } from '../../server/webhooks';
import type { BachsWebhookEvent } from '../../server/schemas';
import type { BachsRuntimeConfig } from '../module';

export function useBachsServer(event: H3Event): BachsServer {
  const config = useRuntimeConfig(event).bachs as BachsRuntimeConfig;
  return createBachsServer({
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });
}

/** Read the original bytes before any JSON body reader. Processing/deduplication belongs to the app. */
export async function readBachsWebhook(
  event: H3Event,
): Promise<BachsWebhookEvent> {
  if (event.method !== 'POST')
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
  const config = useRuntimeConfig(event).bachs as BachsRuntimeConfig;
  if (!config.webhookSecret)
    throw createError({
      statusCode: 500,
      statusMessage: 'Webhook secret is not configured',
    });
  const body = await readLimitedBody(event);
  if (!body.byteLength)
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing webhook body',
    });
  try {
    return verifyBachsWebhook(body, {
      secret: config.webhookSecret,
      signatureV2: getHeader(event, 'x-bachs-signature-v2'),
      signature: getHeader(event, 'x-bachs-signature'),
      timestamp: getHeader(event, 'x-bachs-timestamp'),
    });
  } catch (error) {
    if (error instanceof BachsWebhookError)
      throw createError({ statusCode: 400, statusMessage: error.message });
    throw error;
  }
}

async function readLimitedBody(event: H3Event): Promise<Uint8Array> {
  const limit = 1_048_576;
  const declared = getHeader(event, 'content-length');
  if (declared && Number(declared) > limit)
    throw createError({
      statusCode: 413,
      statusMessage: 'Webhook body too large',
    });
  const stream = event.web?.request?.body ?? nodeBodyStream(event);
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk =
        typeof value === 'string' ? new TextEncoder().encode(value) : value;
      if (!(chunk instanceof Uint8Array))
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid webhook body',
        });
      length += chunk.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw createError({
          statusCode: 413,
          statusMessage: 'Webhook body too large',
        });
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function nodeBodyStream(event: H3Event): ReadableStream<Uint8Array> {
  const request = event.node.req;
  if (request.readableEnded)
    throw createError({
      statusCode: 400,
      statusMessage: 'Read the webhook before consuming its body',
    });
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const data = (chunk: Buffer) => controller.enqueue(chunk);
      const end = () => {
        cleanup();
        controller.close();
      };
      const error = () => {
        cleanup();
        controller.error(
          createError({
            statusCode: 400,
            statusMessage: 'Incomplete webhook body',
          }),
        );
      };
      cleanup = () => {
        request.off('data', data);
        request.off('end', end);
        request.off('error', error);
        request.off('aborted', error);
      };
      request.on('data', data);
      request.once('end', end);
      request.once('error', error);
      request.once('aborted', error);
    },
    cancel() {
      cleanup();
      request.resume();
    },
  });
}
