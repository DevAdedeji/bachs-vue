import { defineEventHandler } from 'h3';
import { context, currentVisitor } from '../utils/demo';
export default defineEventHandler((event) => {
  const ctx = context(event);
  const visitor = currentVisitor(event, ctx);
  return {
    ready: Boolean(visitor),
    portalReady: Boolean(visitor?.customer_id),
  };
});
