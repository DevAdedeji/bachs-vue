import { createHmac, timingSafeEqual } from 'node:crypto';
import { webhookEventSchema, type BachsWebhookEvent } from './schemas';

export interface WebhookVerificationOptions {
  secret: string;
  /** Prefer X-Bachs-Signature-V2. A present but invalid V2 header is never downgraded. */
  signatureV2?: string | null;
  signature?: string | null;
  timestamp?: string | null;
  toleranceSeconds?: number;
  /** Current Unix time in seconds, for deterministic testing. */
  now?: number;
}
export class BachsWebhookError extends Error {
  constructor(message = 'Invalid Bachs webhook signature.') {
    super(message);
    this.name = 'BachsWebhookError';
  }
}

export function verifyBachsWebhook(
  rawBody: string | Uint8Array,
  options: WebhookVerificationOptions,
): BachsWebhookEvent {
  const body =
    typeof rawBody === 'string'
      ? Buffer.from(rawBody, 'utf8')
      : Buffer.from(rawBody);
  if (!options.secret || body.byteLength > 1_048_576)
    throw new BachsWebhookError();
  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.now ?? Date.now() / 1000;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || !Number.isFinite(now))
    throw new BachsWebhookError('Invalid webhook verification configuration.');
  let timestamp = options.timestamp;
  let signatures: string[] = [];
  if (options.signatureV2 !== undefined && options.signatureV2 !== null) {
    const timestamps: string[] = [];
    if (options.signatureV2.length > 4096) throw new BachsWebhookError();
    for (const part of options.signatureV2.split(',')) {
      const [key, value, extra] = part.trim().split('=');
      if (!value || extra !== undefined) throw new BachsWebhookError();
      if (key === 't') timestamps.push(value);
      if (key === 'v1') signatures.push(value);
    }
    if (timestamps.length !== 1) throw new BachsWebhookError();
    timestamp = timestamps[0];
  } else if (options.signature) {
    signatures = [options.signature];
  }
  if (!timestamp || !/^\d+$/.test(timestamp)) throw new BachsWebhookError();
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(now - seconds) > tolerance)
    throw new BachsWebhookError();
  const expected = createHmac('sha256', options.secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest();
  const valid = signatures.some(
    (signature) =>
      /^[0-9a-f]{64}$/i.test(signature) &&
      timingSafeEqual(expected, Buffer.from(signature, 'hex')),
  );
  if (!valid) throw new BachsWebhookError();
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    throw new BachsWebhookError('Invalid webhook JSON.');
  }
  const parsed = webhookEventSchema.safeParse(payload);
  if (!parsed.success)
    throw new BachsWebhookError('Invalid webhook event envelope.');
  return parsed.data;
}
