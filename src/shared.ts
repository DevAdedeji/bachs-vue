/** Require an absolute HTTPS URL without embedded credentials. */
export function httpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Expected an HTTPS URL without credentials.');
  }
  return url.href;
}

export function asError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error('The billing operation failed.');
}
