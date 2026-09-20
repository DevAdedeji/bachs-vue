# Public sandbox playground

A standalone Nuxt app using `bachs-vue@0.1.0` from npm. The local-development example remains in `examples/nuxt`.

## Development

Use Node 24 or newer. Run `npm ci`, copy `.env.example` to `.env`, configure sandbox values, then run `npm run dev`.

The mailbox must be dedicated to sandbox use and support plus-addressing. Each visitor gets a random 24-hour HttpOnly session and a separate Bachs customer at a unique mailbox alias. The portal accepts no customer ID from the browser. It opens only that session's customer. Do not use a production customer or an existing personal customer.

The UI displays browser events only. It does not grant access or fulfil orders. Use the documentation's signed-webhook example for application fulfilment.

## Railway

Deploy this directory using its Dockerfile with a persistent volume mounted at `/data`. Set `NUXT_DEMO_DATA_PATH=/data/playground.sqlite`, `NUXT_DEMO_ORIGIN` to the exact HTTPS deployment origin, and the remaining private values from `.env.example`. The two products must be dedicated sandbox USD 5 products, one one-time and one monthly. Set `NUXT_PUBLIC_DOCS_URL` to the documentation site.

Keep one replica: the SQLite volume stores sessions, idempotency records, and quotas. Do not place this database on an ephemeral filesystem. Keys must begin with `sk_sandbox_`; live keys and invalid public origins fail closed. `/api/health` checks configuration and database availability without calling Bachs.

Limits persist across restarts: 100 new visitors daily, 20 per minute; six distinct checkout attempts per visitor daily and 200 globally; 400 provider checkout attempts globally daily; ten portal sessions per visitor daily and 200 globally. Short request leases prevent concurrent duplicate work. Provider retries reuse the same idempotency key. Changing the browser cookie cannot bypass global limits.

Visitor records expire after 24 hours and are pruned as new sessions are created. Provider sandbox customer records remain with Bachs. Never log API credentials, session cookies, portal URLs, or full provider responses. Back up the volume privately if needed.

## Checks

```sh
npm test
npm run typecheck
npm run build
```
