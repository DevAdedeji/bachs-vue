# Contributing

Use a current Node.js 22 or 24 release and npm. Install with `npm ci` and build with `npm run build` before running either example.

## Local verification

```sh
npm run check
npm run test:consumer -- 4
npm run test:consumer -- 3
```

GitHub Actions is intentionally not configured. These local commands are the release gate; no GitHub Actions minutes are required.

The consumer checks create temporary projects, install the packed tarball, and exercise Nuxt production builds over local HTTP. They need registry access, but no Bachs credentials. Temporary projects remain available for inspection in the OS temporary directory.

## Structure

- `src/vue`: app-scoped state, composables, and the checkout button.
- `src/server`: validated provider requests and webhook verification.
- `src/nuxt`: module registration and runtime helpers.
- `examples`: local Nuxt sandbox playground and plain Vue example.
- `tests`: transport, signature, lifecycle, SSR, and HTTP regression tests.
- `scripts`: package and installed-consumer checks.

Keep server imports out of the public Vue entry. Use the official Bachs contracts, preserve decimal-string amounts, and test failures and concurrency when changing payment behavior. Do not add retries without a stable idempotency contract.

Use focused commits such as `feat: ...`, `fix: ...`, `test: ...`, or `docs: ...`. Branches should describe the work, for example `feat/checkout-options`. Never commit `.env` files, credentials, complete webhook payloads, or portal URLs.

## Documentation site

Run `npm run docs:dev` to edit the VitePress site and `npm run docs:build` to validate links and generate static pages. The site is deployed directly to Cloudflare Pages; it does not depend on GitHub Actions.

## Public playground

The standalone Nuxt app in `apps/playground` installs the published npm package. It is separate from the local examples. Use Node 24+, run `npm ci --prefix apps/playground`, then run its tests, type check, and build:

```sh
npm test --prefix apps/playground
npm run typecheck --prefix apps/playground
npm run build --prefix apps/playground
```

Root `npm run lint` includes its TypeScript and Vue templates. Root `npm run format:check` checks formatting throughout the repository. See the playground README for private sandbox configuration and persistent-storage requirements. Never commit environment files or local databases.
