import { defineEventHandler } from 'h3';
import {
  context,
  currentVisitor,
  issueVisitor,
  demoFailure,
} from '../utils/demo';
export default defineEventHandler((event) => {
  const ctx = context(event, true);
  try {
    const visitor = currentVisitor(event, ctx) ?? issueVisitor(event, ctx);
    return { ready: true, portalReady: Boolean(visitor.customer_id) };
  } catch (error) {
    return demoFailure(error);
  }
});
