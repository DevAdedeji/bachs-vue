import { z } from 'zod';
import {
  checkoutInputSchema,
  checkoutIdSchema,
  checkoutDetailsSchema,
  checkoutSessionSchema,
  customerIdSchema,
  portalSessionSchema,
  type CreateCheckoutInput,
  type CheckoutSession,
  type CheckoutDetails,
  type PortalSession,
} from './schemas';

export class BachsApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly retryAfter?: string,
  ) {
    super(`Bachs request failed (${code}, HTTP ${status}).`);
    this.name = 'BachsApiError';
  }
}
export interface BachsServerOptions {
  apiKey: string;
  /** Inferred from the key if omitted; a mismatch is rejected. */
  environment?: 'sandbox' | 'live';
  timeoutMs?: number;
  /** HTTP transport override, useful for tests. */
  fetch?: typeof globalThis.fetch;
}
export interface CheckoutRequestOptions {
  /** Persist this with your order and reuse it for retries of the same operation. */
  idempotencyKey: string;
}
export function createBachsServer(options: BachsServerOptions) {
  if (typeof window !== 'undefined')
    throw new Error('Bachs secret keys must only be used on the server.');
  const match = /^sk_(sandbox|live)_[A-Za-z0-9_-]+$/.exec(options.apiKey);
  if (!match)
    throw new Error('A valid Bachs sandbox or live API key is required.');
  const environment = match[1];
  if (options.environment && options.environment !== environment)
    throw new Error('Bachs API key and environment do not match.');
  const origin =
    environment === 'sandbox'
      ? 'https://sandbox-api.bachs.io'
      : 'https://api.bachs.io';
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('timeoutMs must be positive.');
  const transport = options.fetch ?? globalThis.fetch;

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method: 'GET' | 'POST',
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: 'application/json',
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const response = await transport(`${origin}${path}`, {
        method,
        headers,
        signal: controller.signal,
        redirect: 'error',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const requestId = response.headers.get('x-request-id') ?? undefined;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (controller.signal.aborted) throw new BachsApiError('TIMEOUT', 0);
        throw new BachsApiError('INVALID_RESPONSE', response.status, requestId);
      }
      if (!response.ok) {
        const parsed = z
          .object({ error_code: z.string().regex(/^[A-Z0-9_]{1,80}$/) })
          .safeParse(payload);
        throw new BachsApiError(
          parsed.success ? parsed.data.error_code : 'API_ERROR',
          response.status,
          requestId,
          response.headers.get('retry-after') ?? undefined,
        );
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success)
        throw new BachsApiError('INVALID_RESPONSE', response.status, requestId);
      return parsed.data;
    } catch (cause) {
      if (cause instanceof BachsApiError) throw cause;
      throw new BachsApiError(
        controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
        0,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async createCheckout(
      input: CreateCheckoutInput,
      requestOptions: CheckoutRequestOptions,
    ): Promise<CheckoutSession> {
      const payload = checkoutInputSchema.parse(input);
      const key = z
        .string()
        .min(1)
        .max(255)
        .regex(/^[\x21-\x7E]+$/)
        .parse(requestOptions?.idempotencyKey);
      return request(
        '/v1/checkout-sessions',
        checkoutSessionSchema,
        'POST',
        payload,
        key,
      );
    },
    async getCheckoutSession(checkoutId: string): Promise<CheckoutDetails> {
      const id = checkoutIdSchema.parse(checkoutId);
      return request(
        `/v1/checkout-sessions/${encodeURIComponent(id)}`,
        checkoutDetailsSchema.refine((session) => session.checkout_id === id),
        'GET',
      );
    },
    async createPortalSession(customerId: string): Promise<PortalSession> {
      const id = customerIdSchema.parse(customerId);
      return request(
        `/v1/customers/${encodeURIComponent(id)}/portal-sessions`,
        portalSessionSchema,
        'POST',
      );
    },
  };
}
export type BachsServer = ReturnType<typeof createBachsServer>;
