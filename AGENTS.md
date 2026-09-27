## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Location card thumbnails

The `/locations` card maps are **static images rendered at build time**, not live
maps — `scripts/generate-thumbnails.mjs` (the `prebuild` npm hook) writes
gitignored WebPs into `src/assets/thumbnails/{slug}.webp`, which the page serves
via `astro:assets`. Do not reintroduce a per-card MapLibre map there: 14 of them
meant 14 WebGL contexts (Chrome caps out near 16) and ~1.6 MB of tile requests on
a page that also loads other maps.

- Rendering uses **`@maplibre/maplibre-gl-native`**, the headless MapLibre
  binding, pinned to the same v6 style spec as `maplibre-gl`. It needs no
  browser. It downloads a prebuilt binary at install time and has **no
  source-build fallback** (`--fallback-to-build=false`), so musl/Alpine and
  FreeBSD cannot install it — macOS and ubuntu-24.04 CI are fine.
- **The build now requires network access** to `tiles.openfreemap.org`. This is
  the only build step that fetches anything.
- The palette is shared with the live maps via `src/lib/map-palette.ts`; change
  it there rather than in a component, so thumbnails and interactive maps cannot
  drift.
- Renders are cached by a `sha256` of style + centre + points + geometry, so an
  unchanged rebuild is ~0.3 s. Use `--force` to re-render, `SKIP_THUMBS=1` to
  opt out. `predev` runs it in `--soft` mode so a network failure cannot stop the
  dev server; `prebuild` runs it hard so a broken thumbnail fails the build.
- `sharp` is an explicit devDependency because this script imports it directly
  (it is also a transitive dep of `astro`, but do not rely on that hoisting).
- `src/assets/thumbnails/manifest.json` is the cache key index. If a location is
  deleted, its stale image is pruned on the next run.

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

Import `maplibre-gl/dist/maplibre-gl.css` in the component's **frontmatter**, not
in its client `<script>`. Astro attributes frontmatter CSS to the pages that
actually render the component, but CSS reached through a `<script>` is not
attributed at all: a single such import linked the 83 KB stylesheet on 936 of
937 built pages, when only 330 render a map. Moving it cut that to exactly those
330 pages (`dist` must satisfy both directions — no page that renders a map
without the stylesheet, and no page that links the stylesheet without a map).
The build is now 977 pages, and the invariant still holds at 330/330. Verify it
by _resolving each `<link>`'s CSS and searching its content_ for
`.maplibregl-`, never by grepping the `dist` filenames: adding a component with
its own stylesheet made Vite merge and rename the MapLibre chunk, so a
filename grep reports 0. Detect a map page by `class="map"` (what
`MapVector`/`MiniMap` hand to MapLibre) **or** `maplibregl-` — MapLibre only
adds `maplibregl-map` at runtime, so a class-only regex misses `/map`.
Note that Astro emits component `<style>` blocks as inline `<style>` elements
_after_ the `<link>` tags, so `:global(.maplibregl-*)` overrides in a component
still beat MapLibre's own rules even though the MapLibre `<link>` now sorts
after `Layout.css`. That only holds for equal specificity: MapLibre sets the
`font` **shorthand** on `.maplibregl-map`, so overriding just `font-family`
against a later-loading shorthand would need a specificity bump.

Caveat: that inline-vs-`<link>` split is **size-dependent** — Vite inlines a
component's CSS only below a threshold, and adding enough rules to a component
silently flips it to a `<link>` that now sorts by chunk name. `DateRail` did
this when it grew scrollbar rules, so its CSS moved from inline-after-links to
`DateRail.<hash>.css` between `Layout.css` and `MushroomCard.css`. Harmless
there (the rail shares no element with the map or the cards), but it means
**never rely on inline-vs-link ordering**; assert cascade order by resolving the
actual `<link>`s instead.

For the same reason, a **dev-only** component must be loaded with a dynamic
`await import()` guarded by `import.meta.env.DEV` — never a static import. A
static import is enough to pull its CSS into a production page's module graph
even when the component never renders; that is how all 532 backlog pages were
linking MapLibre's stylesheet.

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
  them. Five types: `backlog-added`, `identified`, `new-species`,
  `new-location`, `backlog-updated` (schemas in `src/content.config.ts`).
- RSS feeds live at `/rss.xml` (default locale) and `/{locale}/rss.xml`;
  items are built in `src/lib/news.ts`. Absolute links come from the `site`
  config (`astro.config.mjs`), which reads `process.env.SITE_URL` with a
  `http://localhost:4321` fallback — so **production builds must set
  `SITE_URL`** or the RSS links will point at localhost.
- A `backlog-added` batch records items that were in the backlog _at the time_,
  and `getStaticPaths` only builds `/backlog/{date}` for dates that still hold
  items. So a batch whose items have since been identified has no day page.
  Always resolve these links with `backlogBatchLink()` in `src/lib/news.ts`
  (item page → day page → index) rather than string-building `/backlog/{date}`:
  the naive form produced 404s as soon as a batch was identified away.

## Date-first navigation

`/log`, `/backlog`, and `/identifications` are **index-only** pages: an
instructions paragraph plus a day picker. They deliberately render **no
thumbnails and no full listing** — the day pages are the content. Do not
reintroduce a listing on an index; the point is to make the day the unit.

- Day pages exist at `/{locale}/{log,identifications}/{date}` and
  `/{locale}/backlog/{date}`. `backlog/[date]` and `backlog/[slug]` are
  sibling dynamic routes, resolved by Astro's routing order — verified to
  coexist (40 day pages + 266 item pages, no shadowing).
- `DateList.astro` is the pure, no-JS month-grouped day list. It is the single
  renderer used on the index pages, the desktop rail, and the mobile drawer, so
  the three cannot drift. `groupByMonth()` in `src/lib/date-rail.ts` does the
  grouping; months contain individual days, not just month totals.
- `DateRail.astro` is the app shell: a 240px sticky sidebar (≥768px) wrapping a
  content pane, plus, below that breakpoint, a sticky bar opening an off-canvas
  drawer. The drawer is the only client JS here and is a progressive
  enhancement — every page is fully readable with it disabled.
- **The overview pages use the same shell as the day pages** — pass
  `DateRail` a slot holding the title, description, and counts, with `activeDate`
  omitted. That is what makes the two page types feel like one app instead of
  two layouts. Do not hand-roll a two-column grid on an index page: the rail
  geometry lives in `DateRail` only, so a copy of that grid is how the two drift
  apart again.
- **An omitted `activeDate` is the overview marker, and it drives the mobile
  layout**: overview pages get a third `DateList` (`.rail__inline`) under the
  slot, visible below 768px and `display: none` above it, and neither the
  sticky bar nor the drawer is rendered at all — a toggle that opens the very
  list already on screen is just a second way to reach it. Derive it from
  `activeDate === undefined` rather than adding a prop: three index pages all
  having to remember a flag is three chances to forget, and a day page silently
  losing its drawer would be the failure mode. That also keeps the DOM at two
  list instances, not three, so there is no duplicate `nav` landmark.
- The title and description belong in the content pane, never in the rail. The
  rail is navigation (month headings and day rows); prose goes right. Overview
  descriptions keep a `34rem` measure so they do not stretch across the pane.
- **Never let Prettier wrap a line that puts a number next to a label.** A
  newline inside a JSX text node is collapsed away, so `<p>{n} {unit}</p>`
  renders as `22Days` the moment that line exceeds `printWidth` — silently, and
  in every locale. Build the whole string in frontmatter instead
  (`const countLabel = n + ' ' + unit`, or a template literal) and emit a single
  `{countLabel}`. All six overview count lines and the three day-page headers are
  written this way; keep it that way if a label is ever renamed or translated.
- `DateList.astro` stays the single renderer for the list itself, so the sidebar
  and the drawer can never show different days.
- **Parse `YYYY-MM-DD` with `toLocalDate()`** (`src/lib/date-rail.ts`), never
  `new Date(dateStr)`. The string form is UTC midnight, so west of UTC it
  formats as the _previous_ day. In a date-first UI that silently mislabels
  every page. `formatDate()` in `src/i18n/index.ts` routes through it too.
- `DateIndex.astro` and the `formatAnchorDate`/`formatCompactDate` helpers were
  removed with the index listings; do not reintroduce anchor-based day links.
- Layout width is the `--page-max` token (1280px) applied to nav, main, and
  footer. Sticky offsets derive from `--header-h`, so changing the header height
  cannot desynchronise the rail or the scroll-margin.
- The date rail is `--rail-w` (240px) **everywhere** — the day-page sidebar
  column, the mobile drawer (`min(var(--rail-w), 88vw)`), and the whole overview
  column. Never size a rail context in its own units: the overview pages used
  to render at the 34rem text measure, so selecting a date snapped the rail from
  544px to 240px, and constraining only the day list left the title and intro
  still at 544px — the rail block jumped twice over. That class of drift is
  now structural rather than a width to remember: `DateRail` owns the geometry
  and both page types render through it.

## Backlog identification workflow (form is dev only)

The backlog item page (`/{locale}/backlog/{slug}`) lets you promote an
unidentified backlog item into a sighting by filling a form (date, species
dropdown + add-new-species, authors + add-new-authors, a click-to-pin location
map, and optional EN/DE notes). The **page** is built normally (`astro build`
emits all 266 item pages); only the `BacklogIdentify` form — and therefore the
`LocationPicker` map — is dev-gated behind `import.meta.env.DEV`.

That is why a production build has no map on `/backlog/*`: the form is the only
consumer of `LocationPicker`, and it is a dynamic import that production never
executes. Do not add a static `BacklogIdentify` import back, or all 532 backlog
pages would link MapLibre's stylesheet again.

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
