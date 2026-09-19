# Releasing

Publishing is a deliberate manual step. This repository has no GitHub Actions workflows and does not publish on push.

1. Run `npm ci`, then `npm run check`.
2. Run `npm run test:consumer -- 4` and `npm run test:consumer -- 3`.
3. Exercise an actual sandbox checkout, portal session, and signed webhook using credentials stored outside Git.
4. Review `npm audit --omit=dev` and the packed file list from `npm pack --dry-run`.
5. Update version, lockfile, changelog, and verification notes in a focused commit. Verify the Git author/committer and inspect staged changes.
6. Confirm you control the intended npm name/account. If the unscoped name is unavailable, choose a personal scope and update package metadata, imports, and examples before publishing.
7. Run `npm pack` and inspect/install the resulting tarball. No credentials or examples should be included in the published archive.
8. When ready, run `npm publish --access public` using your own npm authentication and required two-factor confirmation.
9. Tag the exact released commit, for example `v0.1.0`, and push the tag. Verify the registry version and test installing it in a new app.

Do not republish an existing version. For regressions, issue a new patch version; consumers can pin the last working version. Keep sandbox and live credentials separate. A package rollback does not undo payment actions, so reconcile uncertain payment outcomes using provider records and persisted idempotency keys.
