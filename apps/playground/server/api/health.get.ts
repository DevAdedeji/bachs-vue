import { defineEventHandler } from 'h3';
import { context } from '../utils/demo';
export default defineEventHandler((event) => {
  context(event);
  return { status: 'ok', environment: 'sandbox' };
});
