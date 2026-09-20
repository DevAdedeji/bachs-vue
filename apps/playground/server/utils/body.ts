import { createError, getHeader, type H3Event } from 'h3';

/** Bound the Node request stream before JSON parsing, including chunked requests. */
export function readDemoBody(event: H3Event): Promise<unknown> {
  const limit = 1024;
  if (!getHeader(event, 'content-type')?.startsWith('application/json')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Send JSON checkout data.',
    });
  }
  if (Number(getHeader(event, 'content-length')) > limit) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Checkout request too large.',
    });
  }
  return new Promise((resolve, reject) => {
    const request = event.node.req;
    const chunks: Buffer[] = [];
    let length = 0;
    const cleanup = () => {
      clearTimeout(timer);
      request.off('data', data);
      request.off('end', end);
      request.off('error', error);
      request.off('aborted', error);
    };
    const fail = (statusCode: number, statusMessage: string) => {
      cleanup();
      request.resume();
      reject(createError({ statusCode, statusMessage }));
    };
    const data = (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit) return fail(413, 'Checkout request too large.');
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(
          createError({
            statusCode: 400,
            statusMessage: 'Invalid JSON checkout data.',
          }),
        );
      }
    };
    const error = () => fail(400, 'Incomplete checkout request.');
    const timer = setTimeout(
      () => fail(408, 'Checkout request timed out.'),
      5000,
    );
    request.on('data', data);
    request.once('end', end);
    request.once('error', error);
    request.once('aborted', error);
  });
}
