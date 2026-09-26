## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Hover styles & touch input

Every `:hover` rule is automatically wrapped in
`@media (hover: hover), (-moz-touch-enabled: 0), (-ms-high-contrast: none), (-ms-high-contrast: active)`
by the `@jetbrains/postcss-require-hover` plugin wired into `vite.css.postcss`
in `astro.config.mjs`. This stops touch browsers from getting a sticky `:hover`
state and from swallowing the first tap of a two-tap activation.

- **Never hand-wrap `:hover` rules** in a `@media` block — the plugin does it.
- The plugin also splits mixed selector lists, so
  `.x:hover, .x[data-active] { … }` correctly keeps the `[data-active]` half
  ungated. That is what keeps active-state styling working on touch.
- When Vite processes a stylesheet more than once (it does, once per
  environment), hover rules end up wrapped in nested _identical_ media queries.
  That is valid CSS and evaluates the same, just slightly redundant — do not
  "fix" it if you see it in `dist/`.
- **Hover-revealed controls also need `pointer-events: none`** in their base
  rule (and `pointer-events: auto` in the `:hover` rule). `opacity: 0` alone
  stays hit-testable, so an invisible control keeps swallowing taps meant for
  the element underneath it. See `.tui-card__arrow` in `MushroomCard.astro`.
- Anything reachable on touch must not _depend_ on hover. Carousels, for
  example, need real touch affordances (`MushroomCard.astro` uses pointer
  swipe + a thumbnail strip; its arrows are mouse-only by design).
- Interactive elements that open the lightbox carry
  `touch-action: manipulation` (and `-webkit-tap-highlight-color: transparent`)
  to opt out of iOS's double-tap-to-zoom tap delay.

## MapLibre

`maplibre-gl` v6 is ESM-only and has **no default export**. Import the namespace
(`import * as maplibregl from 'maplibre-gl'`).

Every map component must import `../lib/maplibre-worker` for its side effect
_before_ the MapLibre import. v6 locates its worker with a computed
`new URL('./maplibre-gl-worker.mjs', import.meta.url)`, which no bundler can
see, so the worker is never emitted; at runtime the request 404s — or, worse, an
SPA fallback answers it with `index.html` and the worker is silently handed HTML.
`src/lib/maplibre-worker.ts` fixes this with `setWorkerUrl()`.

- Use `?worker&url`, **not** `?url`. The dist worker imports its sibling
  `maplibre-gl-shared.mjs`; `?url` emits it verbatim without that chunk and the
  worker dies on its first import, so no vector tiles load. `?worker&url` routes
  it through Vite's worker pipeline and emits a self-contained chunk.
- `setPaintProperty` is typed `<K extends keyof AllPaintProperties>` in v6. The
  shared `paint()` helpers derive `PaintKey`/`PaintValue` via
  `Parameters<maplibregl.Map['setPaintProperty']>` so palette property names are
  checked against the real style spec (no need to import the transitive
  `@maplibre/maplibre-gl-style-spec`). Adding a layer to a palette with a
  misspelled property is now a compile error instead of a silent no-op.
- `maplibre-contour`'s `DemSource.setupMaplibre()` only needs `addProtocol`,
  which still exists in v6, so it is compatible. The registered protocol is
  `dem-contour://` (built from `DemSource`'s default `id: 'dem'`), not
  `mlcontour://`. `MapVector.astro` passes `worker: false`, so the DEM manager
  runs on the main thread and no extra blob worker is created.
- Contours only render at zooms that have a `thresholds` entry. `addContours()`
  configures 12/13/14, but the map's zoom is derived from fitting the fixed 15 km
  `bounds` box and lands at **z9.0–10.1 on every viewport tested**, so at the
  default view the handler resolves an empty interval set and fetches no DEM
  tiles. The source is still added and loads — it just yields no features. Not a
  v6 migration regression; identical on v4. Fix by extending `thresholds` down to
  the default zoom (or raising the map's default zoom).

## Formatting

All code must follow the Prettier rules (`semi: false`, `singleQuote: true`,
`printWidth: 100`) defined in `prettier.config.ts`. After any change, run
`npm run format` (or at minimum verify with `npm run format:check`) before
finishing.

TypeScript must compile: run `npm run typecheck` (`astro check`) and keep it at
0 errors. The pre-commit hook enforces both typecheck and Prettier
(`.husky/pre-commit`).

## News & RSS

- The `news` content collection (`src/content/news/{date}-{type}-{nn}`) drives
  the home-page feed and the RSS feeds. Events are appended via
  `scripts/news-events.mjs` `appendNewsEvent()` (from `api.mjs`,
  `import-backlog-public.mjs`, and the backfill scripts) — **never hand-edit**
  them. Four types: `backlog-added`, `identified`, `new-species`,
  `new-location` (schemas in `src/content.config.ts`).
- RSS feeds live at `/rss.xml` (default locale) and `/{locale}/rss.xml`;
  items are built in `src/lib/news.ts`. Absolute links come from the `site`
  config (`astro.config.mjs`), which reads `process.env.SITE_URL` with a
  `http://localhost:4321` fallback — so **production builds must set
  `SITE_URL`** or the RSS links will point at localhost.

## Backlog identification workflow (dev only)

The backlog identification page (`/{locale}/backlog/{slug}`) lets you promote an
unidentified backlog item into a sighting by filling a form (date, species
dropdown + add-new-species, authors + add-new-authors, a click-to-pin location
map, and optional EN/DE notes). It is **only generated in dev**; `astro build`
skips these routes.

It requires a local Express API alongside the Astro dev server:

```
node scripts/api.mjs        # identify API on http://localhost:4322
```

- The Astro dev server proxies `/myco/api` → `http://localhost:4322`
  (`vite.server.proxy` in `astro.config.mjs`).
- On form submit `POST /api/sightings`: optionally creates new `species` /
  `location` / `authors` entries, creates a new `sighting` entry (copying the
  item's images into it, renamed `{speciesSlug}{n}.jpg`), removes the backlog
  item, and appends `identified` (+ `new-species` / `new-location`) news events.
- Other dev-only endpoints: `POST /api/sightings/cover` (reorders a sighting's
  images; first = cover) and `POST /api/backlog/:id/location` (pin/remove a
  backlog item's location).
- Backlog items live in the `backlog` content collection (`src/content/backlog/{n}`,
  numeric slug, `authors` + `dateSpotted` + `images`, optional EXIF-GPS `location`).

## Content collections

- `species` — shared species data (scientific/common name, determining features,
  habitat, edibility, notes, optional `cover`). Sightings reference species by slug only.
- `locations` — shared location data (localized name, description, forest/soil
  type, optional `center`). Sightings reference locations by `locationSlug`.
- `authors` — contributor data (name); referenced by sightings and backlog items.
- `sightings` — per-observation data (species ref, location ref, authors,
  dates, location, images, notes).
- `backlog` — unidentified items awaiting identification (authors, date,
  images, optional GPS location).
- `news` — declarative news events; generated by scripts, never hand-edited.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
