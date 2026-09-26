// Vite's `?worker&url` import suffix. Declared here because `astro/client` only references
// `vite/types/import-meta.d.ts` — not the full `vite/client` module declarations.
declare module '*?worker&url' {
  const url: string
  export default url
}
