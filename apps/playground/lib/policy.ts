import { DemoError } from './store.ts';
export function assertOrigin(origin: string | undefined, expected: string) {
  if (!expected || origin !== expected)
    throw new DemoError(403, 'Open this action from the playground.');
}
export function customerEmail(mailbox: string, visitorId: string) {
  const match = /^([^+@]+)(?:\+[^@]+)?@([a-z0-9.-]+)$/i.exec(mailbox);
  if (!match || !/^[a-f0-9-]{36}$/.test(visitorId))
    throw new Error('Configure a dedicated sandbox mailbox.');
  const local = `${match[1]}+bv${visitorId.replaceAll('-', '')}`;
  if (local.length > 64)
    throw new Error('Sandbox mailbox local part is too long.');
  return `${local}@${match[2]}`;
}
