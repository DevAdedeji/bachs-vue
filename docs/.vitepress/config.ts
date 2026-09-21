import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'bachs-vue',
  description: 'Bachs checkout and billing for Vue and Nuxt.',
  cleanUrls: true,
  lastUpdated: false,
  head: [
    ['meta', { name: 'theme-color', content: '#254b3c' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Playground', link: '/playground' },
      { text: 'v0.2.1', link: 'https://www.npmjs.com/package/bachs-vue' },
    ],
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Introduction', link: '/getting-started' },
          { text: 'Vue', link: '/vue' },
          { text: 'Nuxt', link: '/nuxt' },
          { text: 'Sandbox playground', link: '/playground' },
        ],
      },
      {
        text: 'Server and payments',
        items: [
          { text: 'Server API & webhooks', link: '/server' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
        ],
      },
      {
        text: 'Project',
        items: [
          {
            text: 'Contributing',
            link: 'https://github.com/DevAdedeji/bachs-vue/blob/main/CONTRIBUTING.md',
          },
          {
            text: 'Security',
            link: 'https://github.com/DevAdedeji/bachs-vue/blob/main/SECURITY.md',
          },
          {
            text: 'Releases',
            link: 'https://github.com/DevAdedeji/bachs-vue/releases',
          },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/DevAdedeji/bachs-vue' },
    ],
    search: { provider: 'local' },
    outline: [2, 3],
    editLink: {
      pattern: 'https://github.com/DevAdedeji/bachs-vue/edit/main/docs/:path',
      text: 'Improve this page',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 DevAdedeji',
    },
  },
});
