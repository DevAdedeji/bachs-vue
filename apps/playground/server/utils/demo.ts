import {
  getCookie,
  setCookie,
  getHeader,
  setResponseHeader,
  createError,
  type H3Event,
} from 'h3';
import { useRuntimeConfig } from '#imports';
import { createBachsServer } from 'bachs-vue/server';
import { DemoStore, DemoError, type Visitor } from '../../lib/store';
import { assertOrigin, customerEmail } from '../../lib/policy';
import { sandboxCustomerId } from '../../lib/customer';

let storage: DemoStore | undefined;
export function context(event: H3Event, mutation = false) {
  setResponseHeader(event, 'Cache-Control', 'no-store');
  const config = useRuntimeConfig(event);
  const demo = config.demo;
  if (
    !/^sk_sandbox_[A-Za-z0-9_-]+$/.test(config.bachs.apiKey) ||
    !demo.dataPath ||
    !demo.mailbox ||
    !demo.origin ||
    !demo.productId ||
    !demo.subscriptionProductId
  )
    throw createError({
      statusCode: 503,
      statusMessage: 'The sandbox playground is temporarily unavailable.',
    });
  const origin = new URL(demo.origin);
  if (
    origin.origin !== demo.origin ||
    (!import.meta.dev && origin.protocol !== 'https:')
  )
    throw createError({
      statusCode: 503,
      statusMessage: 'The sandbox origin is not configured.',
    });
  if (mutation) {
    try {
      assertOrigin(getHeader(event, 'origin'), demo.origin);
    } catch {
      throw createError({
        statusCode: 403,
        statusMessage: 'Open this action from the playground.',
      });
    }
  }
  const store = (storage ??= new DemoStore(demo.dataPath));
  const cookieName =
    origin.protocol === 'https:' ? '__Host-bachs-demo' : 'bachs-demo';
  return {
    config,
    demo,
    store,
    cookieName,
    client: createBachsServer({
      apiKey: config.bachs.apiKey,
      environment: 'sandbox',
      timeoutMs: 15_000,
    }),
  };
}
export function currentVisitor(
  event: H3Event,
  ctx: ReturnType<typeof context>,
) {
  return ctx.store.visitor(getCookie(event, ctx.cookieName));
}
export function requireVisitor(
  event: H3Event,
  ctx: ReturnType<typeof context>,
): Visitor {
  const visitor = currentVisitor(event, ctx);
  if (!visitor)
    throw createError({
      statusCode: 401,
      statusMessage:
        'Your demo session expired. Reload this page to start again.',
    });
  return visitor;
}
export function issueVisitor(event: H3Event, ctx: ReturnType<typeof context>) {
  const issued = ctx.store.issue();
  setCookie(event, ctx.cookieName, issued.token, {
    httpOnly: true,
    secure: ctx.demo.origin.startsWith('https:'),
    sameSite: 'strict',
    path: '/',
    maxAge: 86_400,
  });
  return issued.visitor;
}
export async function ensureCustomer(
  ctx: ReturnType<typeof context>,
  visitor: Visitor,
) {
  const existing = ctx.store.claimCustomer(visitor);
  if (existing) return existing;
  try {
    const email = customerEmail(ctx.demo.mailbox, visitor.id);
    const response = await fetch('https://sandbox-api.bachs.io/v1/customers', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${ctx.config.bachs.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `public_demo_customer_${visitor.id}`,
      },
      body: JSON.stringify({ email, name: 'Sandbox Visitor' }),
    });
    if (!response.ok) throw new Error('Customer unavailable');
    const customerId = sandboxCustomerId(await response.json(), email);
    ctx.store.saveCustomer(visitor, customerId);
    return customerId;
  } catch {
    ctx.store.releaseCustomer(visitor);
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not prepare the sandbox customer. Please retry.',
    });
  }
}
export function demoFailure(error: unknown): never {
  if (error instanceof DemoError)
    throw createError({
      statusCode: error.status,
      statusMessage: error.message,
    });
  throw error;
}
