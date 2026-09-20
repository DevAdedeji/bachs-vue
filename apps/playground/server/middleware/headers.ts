import { defineEventHandler, setResponseHeaders } from 'h3';
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (event.path.startsWith('/api/'))
    setResponseHeaders(event, { 'Cache-Control': 'no-store' });
});
