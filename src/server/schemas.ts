import { z } from 'zod';
import { httpsUrl } from '../shared';

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]+$`));
const decimal = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/, 'Use a decimal string, not minor units.');
const currency = z.string().regex(/^[A-Z]{3}$/);
const redirectUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  );
}, 'Use HTTPS, or HTTP on localhost for development.');
const hostedUrl = z.string().refine((value) => {
  try {
    httpsUrl(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid hosted URL.');
const priceFields = {
  price_type: z.enum(['fixed', 'custom', 'free']).optional(),
  amount: decimal.optional(),
  preset_amount: decimal.optional(),
  minimum_amount: decimal.optional(),
  maximum_amount: decimal.optional(),
};
const price = z
  .strictObject(priceFields)
  .refine(
    (value) =>
      (value.price_type ?? 'fixed') !== 'fixed' || value.amount !== undefined,
    'Fixed pricing requires an amount.',
  );
const rawPrice = z
  .strictObject({
    ...priceFields,
    currency,
    currency_options: z.record(currency, decimal).optional(),
  })
  .refine(
    (value) =>
      (value.price_type ?? 'fixed') !== 'fixed' || value.amount !== undefined,
    'Fixed pricing requires an amount.',
  );
const customer = z.union([
  z.strictObject({ customer_id: id('cust') }),
  z.strictObject({
    email: z.email(),
    name: z.string().min(1),
    phone_number: z.string().optional(),
  }),
]);
const common = {
  customer: customer.optional(),
  customer_creation: z.enum(['always', 'if_required']).optional(),
  billing_currency: currency.optional(),
  payment_method_types: z.array(z.string().min(1)).min(1).optional(),
  success_url: redirectUrl.optional(),
  cancel_url: redirectUrl.optional(),
  reference: z.string().min(1).max(128).optional(),
  expires_in_minutes: z.number().int().min(1).max(1440).optional(),
  metadata: z
    .record(z.string(), z.json())
    .refine(
      (value) =>
        Object.keys(value).length <= 20 &&
        new TextEncoder().encode(JSON.stringify(value)).byteLength <= 10_240,
      'Metadata exceeds Bachs limits.',
    )
    .optional(),
};
export const checkoutInputSchema = z.union([
  z.strictObject({
    ...common,
    product_cart: z
      .array(
        z.strictObject({
          product_id: id('prod'),
          quantity: z.number().int().positive().optional(),
          amount: decimal.optional(),
          pricing: price.optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
  z.strictObject({ ...common, pricing: rawPrice }),
]);
export const checkoutSessionSchema = z.looseObject({
  checkout_id: z.string().min(1),
  checkout_url: hostedUrl,
  status: z.string().min(1),
  expires_at: z.string().optional(),
  created_at: z.string().optional(),
  reference: z.string().nullable().optional(),
});
export const portalSessionSchema = z.looseObject({
  id: z.string().min(1),
  url: hostedUrl,
});
export const webhookEventSchema = z.looseObject({
  id: id('evt'),
  type: z.string().min(1),
  created_at: z.string().min(1),
  organization_id: z.string().min(1),
  account: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});
export const customerIdSchema = id('cust');
export type CreateCheckoutInput = z.input<typeof checkoutInputSchema>;
export type CheckoutSession = z.output<typeof checkoutSessionSchema>;
export type PortalSession = z.output<typeof portalSessionSchema>;
export type BachsWebhookEvent = z.output<typeof webhookEventSchema>;
