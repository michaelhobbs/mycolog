// maplibre-gl v6 locates its worker with a *computed* `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`, so no bundler can see the reference and the file is never emitted. At
// runtime the request then resolves next to the hashed app chunk, where nothing exists — a
// 404, or an index.html body when an SPA fallback answers it — and no vector tiles ever load.
//
// Import this module for its side effect before constructing the first `new Map()`.
// `?worker&url` (not plain `?url`) is required: the dist worker imports its sibling
// `maplibre-gl-shared.mjs`, and `?url` emits it verbatim without that chunk, so the worker
// dies on its first import. `?worker&url` routes it through Vite's worker pipeline and emits
// a self-contained chunk.
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)
