<script setup lang="ts">
import { ref } from 'vue';
import { BachsCheckoutButton, useBachsCheckout } from 'bachs-vue';
const url = ref('');
const { status, error } = useBachsCheckout();
</script>
<template>
  <main>
    <p>BACHS + VUE</p>
    <h1>A checkout in your component.</h1>
    <p>
      Create a sandbox session on your server, then paste its checkout URL
      below.
    </p>
    <label for="checkout-url">Sandbox checkout URL</label>
    <input
      id="checkout-url"
      v-model="url"
      type="url"
      placeholder="https://checkout.bachs.io/c/…"
    />
    <BachsCheckoutButton :checkout="url" :disabled="!url"
      >Open checkout</BachsCheckoutButton
    >
    <p aria-live="polite">Status: {{ status }}</p>
    <p v-if="error" role="alert">{{ error.message }}</p>
    <small
      >Never put a secret API key in a Vue application. Confirm payments with
      server webhooks.</small
    >
  </main>
</template>
<style>
body {
  font-family: system-ui, sans-serif;
  background: #f4f5ef;
  color: #203630;
  margin: 0;
}
main {
  max-width: 580px;
  margin: 12vh auto;
  padding: 24px;
}
h1 {
  font-size: 40px;
  letter-spacing: -1px;
}
p {
  line-height: 1.7;
}
label,
input,
button {
  display: block;
}
input {
  box-sizing: border-box;
  margin: 10px 0 20px;
  width: 100%;
  padding: 14px;
  border: 1px solid #a5b5a1;
  border-radius: 8px;
}
button {
  padding: 14px 20px;
  background: #264939;
  color: white;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
small {
  display: block;
  line-height: 1.7;
  color: #68766d;
}
</style>
