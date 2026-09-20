import { z } from 'zod';

const customerResponse = z.object({
  customer_id: z.string().regex(/^cust_[A-Za-z0-9_-]+$/),
  email: z.email(),
});

export function sandboxCustomerId(
  payload: unknown,
  expectedEmail: string,
): string {
  const customer = customerResponse.parse(payload);
  if (customer.email.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error('Sandbox customer does not match this visitor.');
  }
  return customer.customer_id;
}
