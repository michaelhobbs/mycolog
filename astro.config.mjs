// @ts-check
import requireHover from '@jetbrains/postcss-require-hover'
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
    css: {
      postcss: {
        // Every `:hover` rule is wrapped in `@media (hover: hover)`, so touch
        // devices never get a sticky/tap-swallowing hover state. Do NOT hand-wrap
        // hover rules in the component styles — this handles it. Any control that
        // is revealed on hover still needs `pointer-events: none` in its base rule.
        plugins: [requireHover()],
      },
    },
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
