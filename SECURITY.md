# Security

This community package has not undergone an independent security audit.

Never include keys, customer information, portal URLs, or complete webhook payloads in a public issue. Use GitHub's private vulnerability reporting if enabled on this repository. If it is unavailable, open an issue asking the maintainer for a private reporting channel without disclosing exploit details or sensitive data.

For application integrations:

- Authenticate and authorize checkout and portal requests on your server.
- Keep API keys and webhook secrets out of all public/client configuration.
- Verify original webhook bytes and enforce event-ID uniqueness in durable storage.
- Use HTTPS, request limits/timeouts, rate limiting, and CSRF protection.
- Treat browser checkout events as UI signals, not proof of paid access.
- Keep the official Bachs SDK and this package updated after reviewing changes.

See [server guidance](docs/server.md) for error recovery and fulfilment responsibilities.
