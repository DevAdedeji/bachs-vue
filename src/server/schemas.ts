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
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use a public HTTPS return URL. Omit redirects for local overlay testing.');
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
const transferData = z.strictObject({
  destination: id('acct'),
  amount: decimal.optional(),
});
const common = {
  platform_fee: decimal.optional(),
  transfer_data: transferData.optional(),
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
export const checkoutInputSchema = z
  .union([
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
  ])
  .superRefine((value, ctx) => {
    if (!value.transfer_data) return;
    const hasFee = value.platform_fee !== undefined;
    const hasAmount = value.transfer_data.amount !== undefined;
    if (hasFee === hasAmount) {
      ctx.addIssue({
        code: 'custom',
        path: ['transfer_data'],
        message:
          'A destination checkout requires exactly one of platform_fee or transfer_data.amount.',
      });
    }
  });
export const checkoutSessionSchema = z.looseObject({
  checkout_id: z.string().min(1),
  checkout_url: hostedUrl,
  status: z.string().min(1),
  expires_at: z.string().optional(),
  created_at: z.string().optional(),
  reference: z.string().nullable().optional(),
});
// Retrieval returns payment details rather than the URL returned by creation.
export const checkoutIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/);
export const checkoutDetailsSchema = z.looseObject({
  checkout_id: checkoutIdSchema,
  status: z.string().min(1),
  payment_status: z.string().min(1).nullable().optional(),
  amount: decimal,
  currency,
  reference: z.string().nullable().optional(),
  customer: z
    .looseObject({
      id: id('cust').nullable().optional(),
      email: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    })
    .nullable(),
  charge: z
    .looseObject({
      payment_id: id('pay'),
      status: z.string().min(1),
      amount: decimal,
      currency,
    })
    .nullable()
    .optional(),
  platform_fee: decimal.nullable().optional(),
  destination_amount: decimal.nullable().optional(),
  billing_currency: currency.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  expires_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
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

export type CheckoutDetails = z.output<typeof checkoutDetailsSchema>;
