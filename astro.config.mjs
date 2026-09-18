// @ts-check
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  i18n: {
    locales: ['en', 'de'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    server: {
      proxy: {
        // Dev-only identify API (scripts/api.mjs). Not active in the static build.
        '/myco/api': {
          target: 'http://localhost:4322',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/myco\/api/, '/api'),
        },
      },
    },
  },
})
