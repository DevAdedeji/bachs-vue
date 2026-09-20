import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import vue from 'eslint-plugin-vue';
export default ts.config(
  {
    ignores: [
      'dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      'node_modules/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['examples/nuxt/**/*.vue', 'apps/playground/**/*.vue'],
    languageOptions: {
      globals: {
        useRuntimeConfig: 'readonly',
        useBachsCheckout: 'readonly',
        useBachsPortal: 'readonly',
        ref: 'readonly',
        $fetch: 'readonly',
      },
    },
  },
);
