# Changelog

## Unreleased

- Add bounded, cancellable payment confirmation through an application-owned endpoint, including manual retries and protection against stale order responses.
- Auto-import `useBachsPaymentConfirmation` in Nuxt and export its public types for Vue.
- Support destination checkout splits using a platform fee or a fixed seller amount, with decimal-string validation and mutually exclusive split terms.
- Retrieve checkout sessions with validated payment details, safe identifiers, and existing timeout/error handling.
- Extend regression tests and installed Nuxt 3/4 consumer checks for the new APIs.

## 0.1.0 — 2026-09-20

- Vue checkout state/composables and customizable checkout button.
- Fresh customer portal navigation.
- Nuxt module with auto-imports and private runtime credentials.
- Server checkout/portal helpers with request validation and explicit idempotency.
- Legacy/V2 webhook verification and rotation support.
- Local examples, regression tests, and installed-package checks.
- Preserve checkout outcomes across late readiness events and ignore callbacks after closure.
