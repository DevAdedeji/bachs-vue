# Sandbox playground

Try checkout without moving real money. The public playground demonstrates the published package's checkout overlay, subscription flow, event state, and customer portal.

The hosted address will be added here after deployment.

## Run the local example

```sh
git clone https://github.com/DevAdedeji/bachs-vue.git
cd bachs-vue
npm ci
npm run build
cp examples/nuxt/.env.example examples/nuxt/.env
```

Add your sandbox API key and a deliverable email you control, then create the fixtures:

```sh
npm run sandbox:seed
npm run dev
```

Never use real card details in the sandbox. Follow the test-payment instructions shown by the Bachs checkout.

The local example only accepts local development requests and sandbox keys. Its billing routes are disabled in production. The hosted playground is a separate application with visitor-specific sandbox customers and request limits.

## Plain Vue example

```sh
npm run example:vue
```

Paste a checkout URL created by your own backend. Never paste an API key or share a customer portal URL.
