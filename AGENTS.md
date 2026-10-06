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
- **On Linux the prebuilt binary needs system libraries and an X display.** It is
  a GLX addon, so it links `libGLX.so.0` / `libOpenGL.so.0`, which the GitHub
  runner image does not ship, hence `ERR_DLOPEN_FAILED` at `require()` time. CI
  installs `libgl1 libglx0 libopengl0 libgl1-mesa-dri libglx-mesa0 xvfb xauth`
  (the mesa pair supplies the llvmpipe software rasteriser — no GPU on CI) and
  runs the build as `xvfb-run --auto-servernum npm run build`. A missing X
  display is a C++ `std::runtime_error` → `terminate()`, i.e. an **uncatchable
  abort**, so it cannot be handled by the script's `try/catch` nor downgraded by
  `--soft`; `main()` therefore preflights `DISPLAY` on Linux and fails early with
  an actionable message. macOS renders through Metal and needs no `DISPLAY`.
  Because the binary is published for Ubuntu 24.04 only (glibc ≥ 2.38,
  `libjpeg.so.8`, `libicu*.so.74`), the workflow pins `runs-on: ubuntu-24.04`
  rather than `ubuntu-latest` — an image bump breaks it in ways an `apt` line
  cannot paper over. `libEGL`/`libegl1` is _not_ needed: the binding is GLX-only.
- The script is `.mjs` but imports `../src/lib/map-palette.ts`, so it relies on
  Node's type stripping. That is on by default from **Node 22.18**, hence
  `node-version: 22` (which floats above that floor) rather than a pinned patch.
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

## Responsive images

**Every `<Image>` that sets `widths` must also set `width`, and `width` must be
the largest entry in that list.** This is not a style preference — omitting it is
a silent 1.5 GB regression.

Astro's `internal.js` falls back to `originalWidth`/`originalHeight` when neither
`width` nor `height` is given, so `<Image src={img} widths={[400, 800]} />` makes
the _primary_ transform the untouched 3024×4032 original and emits it as the `src`
fallback next to the `srcset`. Every browser with `srcset` support picks a
`srcset` candidate and never requests that file, so it is pure dead weight —
built, shipped and stored for nothing.

Measured across the site (1,492 photos): 1,490 full-resolution WebP, 1,481 MB,
**63% of `dist`**, and 766 ms of sharp CPU each — ~1,141 s of encoding per cold
build. Verified 7,818 full-res `src` references in the built HTML, all of them
`srcset`-paired, i.e. 0 real requests. Setting `width` to the largest candidate
makes `matchesValidatedTransform` reuse that file as the `src`, so this **removes**
an encode rather than adding one:

| Site                      | `widths`          | `width` |
| ------------------------- | ----------------- | ------- |
| `MushroomCard.astro`      | `[640, 320]`      | 640     |
| `mushrooms/index.astro`   | `[320, 640]`      | 640     |
| `mushrooms/[name].astro`  | `[320, 640]`      | 640     |
| `log/[date]/[slug].astro` | `[320, 640]`      | 640     |
| `backlog/[date].astro`    | `[400, 800]`      | 800     |
| `backlog/[slug].astro`    | `[400, 800]`      | 800     |
| `locations/index.astro`   | `[260, 520, 891]` | 891     |

Result: 4,951 images instead of 6,441, `dist` 2.30 GB → 921 MB, and no `dist`
image ≥ 3000 px wide. The emitted `width`/`height` attributes change but the
aspect ratio does not, so layout and CLS are unaffected. An `<Image>` with
neither `width` nor `widths` is fine as long as it sets an explicit small `width`
(that is what the 96px sighting rows in `mushrooms/[name].astro` do).

Assert the invariant after touching an `<Image>`: no image in `dist/_astro` may be
≥ 3000 px wide, and every `<img src>` URL must be a member of its own `srcset`.

## CI

`.github/workflows/deploy.yml` is the only deploy path. Measured cost of the
steps that are still worth watching: `checkout` 224–320 s (the repo is 3.81 GB
because all 1,492 photos live in git), and `rsync` 215–224 s. The build was
1,169–1,377 s cold before the image fix above.

- **`actions/cache` for `node_modules/.astro/assets` sits _after_ `npm ci`**,
  because `npm ci` deletes `node_modules` outright and would otherwise discard a
  restored cache. The key is deliberately **stable across content commits**
  (`package-lock.json` + `astro.config.mjs`): Astro names every derivative by a
  hash of its own source and transform, so a restored cache is always safe to
  reuse and stale entries are simply never requested. Do **not** add `src/**` to
  the key — it would miss on every commit and defeat the whole point.
- **Bump the `-v1` suffix whenever an image width, quality or format changes.**
  `actions/cache` only saves on a primary-key _miss_, so a key that already hits
  will never re-save, and the new derivatives would be re-encoded on every
  subsequent build forever.
- **`rsync --checksum` is load-bearing.** Astro rewrites the mtime of every file
  it rebuilds, so rsync's default size+mtime test fails across the whole of
  `dist/` and re-uploads everything on every deploy even when the bytes are
  identical. `-c` trades ~10 s of hashing for a transfer that drops to
  essentially nothing when no content changed.
- Cold build is ~4 min, warm ~9 s (all 4,951 derivatives log "reused cache
  entry"). `prebuild` thumbnails are ~3.5 s of that and are not a bottleneck.

## Lightbox

`Lightbox.astro` is **one `<dialog>` for the whole page**, mounted once in
`Layout.astro` — not one per gallery. Its script is `is:inline` (so it is emitted
unbundled: no imports, no TypeScript) and resolves `[data-lightbox-modal]` a single
time, then serves every gallery through one document-level click listener. Keep it
that way: a second mount, or a per-component instance, silently leaves every
gallery but the first dead.

A gallery opts in with `data-lightbox-group`; per-photo URLs come from
`data-lightbox-src`, and a trigger carries `data-lightbox-trigger` plus an optional
`data-index` (it falls back to the group's own `data-index`, then 0). A group
without any `data-lightbox-src` falls back to its own `<img>` elements as sources,
so a plain gallery needs no changes to become lightbox-able.

- **All five source producers pass `getImage({ src: img, width: 1600 })`**:
  `MushroomCard.astro`, `mushrooms/[name].astro`, `log/[date]/[slug].astro`,
  `backlog/[slug].astro`, `backlog/[date].astro`. Those are 1600px WebP
  derivatives, never the original JPEGs (median 336 kB, p90 897 kB, max 1.5 MB),
  and they are a _different_ asset from the 320/640px card thumbnails — pointing
  the lightbox at the thumbnails would show a blurry fullscreen photo.
- **Preloading is per opened group, never per page.** A backlog day page carries
  292 sources across 59 groups, so anything page-scoped would fetch ~100 MB. The
  largest single group is 33 photos (~10.8 MB at the median), which is why
  `preload()` orders the queue nearest-first from the current index and keeps only
  `PRELOAD_CONCURRENCY` (4) requests in flight: 33 in parallel would starve the
  image the viewer is about to swipe to. Measured ceiling is 4 preloads plus the
  displayed one. Do not simplify this into "fetch the group on load".
- **`close` bumps `preloadToken`**, which retires the queue so the tail of a large
  group stops costing bandwidth the moment the viewer walks away (a 33-photo group
  closed 400 ms in issues a handful of requests, not 33). Finished images stay in
  the HTTP cache, so reopening is instant — do not "fix" that by caching the queue
  itself.
- `update()` calls `resetZoom()`, so a slide change never inherits zoom or pan from
  the previous photo. Keep the reset inside `update()`.
- `open()` is the only thing that locks `document.body.style.overflow`, and `close`
  is the only thing that clears it; any new open path must go through `open()` or
  the page will scroll behind the modal.
- <kbd>Esc</kbd> resets the zoom first and only closes on the second press: the
  `cancel` handler calls `preventDefault()` while `scale > 1`.

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
  content pane, plus, below that breakpoint, an overlay drawer holding every day.
  Its script is the only client JS here and is a progressive enhancement — every
  page is fully readable with it disabled.
- **The overview pages use the same shell as the day pages** — pass
  `DateRail` a slot holding the title, description, and counts, with `activeDate`
  omitted. That is what makes the two page types feel like one app instead of
  two layouts. Do not hand-roll a two-column grid on an index page: the rail
  geometry lives in `DateRail` only, so a copy of that grid is how the two drift
  apart again.
- **The mobile toggle lives in `Layout`'s header, not in the rail.** It is
  rendered on _every_ page carrying the `hidden` attribute, and `DateRail`'s
  script clears it only when it finds the drawer that `aria-controls` names. So
  no page has to remember a flag — a day page cannot silently lose its only
  mobile navigation — and the pages without a drawer carry a permanently hidden
  button. The `hidden` restatement in `Layout.css` is load-bearing: an author
  `display` beats the UA's `[hidden]` rule, so without it the button would show
  on every page.
- Hide that button with `min-width: 768px`, not the `max-width` query the nav
  itself uses. At exactly 768px both queries apply, and the drawer is
  `display: none !important` there, so a `max-width` rule would leave a button
  that opens nothing. From 768px up the sidebar replaces it.
- **The scrim and the panel start at `var(--header-h)`, and the header stays
  above both.** A sticky bar _inside_ the rail used to sit at `z-index: 50` over
  a `z-index: 1` panel, so the toggle covered the top of the date list whenever
  the drawer was open; starting the overlay under the header removes that
  overlap structurally, and keeping the header on top leaves the toggle itself
  visible as the close control. The header (z-index 100) must stay above the
  drawer (z-index 1) or the button the user just pressed vanishes behind the dim.
- The toggle is a toggle, not an opener: one click opens, the next closes, and
  `aria-expanded` tracks it. **The panel is the day list and nothing else — it has
  no close button**, so the only three close paths are the toggle, the scrim, and
  <kbd>Esc</kbd>; do not add a fourth. Focus moves into the panel on open (onto
  the first day row, the only focusable left in it) and returns to the toggle on
  close, and the <kbd>Tab</kbd> trap still wraps at both ends.
- The drawer `<div>` and its `DateList` must not share an id: `aria-controls`
  and `getElementById` both resolve to the first match in document order, so an
  overlapping `idPrefix` wires the toggle to the wrong element.
- **An omitted `activeDate` is the overview marker, and it drives the mobile
  layout**: overview pages get a third `DateList` (`.rail__inline`) under the
  slot, visible below 768px and `display: none` above it, and no drawer at all —
  the header toggle then stays hidden because it has nothing to open. Derive it
  from `activeDate === undefined` rather than adding a prop: three index pages
  all having to remember a flag is three chances to forget, and a day page
  silently losing its drawer would be the failure mode. That also keeps the DOM
  at two list instances, not three, so there is no duplicate `nav` landmark.
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
  column, the mobile drawer's minimum, and the whole overview column. Never size
  a rail context in its own units: the overview pages used to render at the 34rem
  text measure, so selecting a date snapped the rail from 544px to 240px, and
  constraining only the day list left the title and intro still at 544px — the
  rail block jumped twice over. That class of drift is now structural rather than
  a width to remember: `DateRail` owns the geometry and both page types render
  through it.
- The mobile drawer panel is `width: max-content` with a
  `min-width: min(var(--rail-w), 88vw)` floor and a `max-width: 92vw` cap —
  `--rail-w` is its _floor_, not its width, because German does not fit 240px: a
  day row like `Mo., 21. Sept.21 Beobachtungen` needs 237px of content, and the
  panel's 1rem padding turned the overflow into a horizontal scrollbar (English
  fits at 240, so check German when touching this). The rows size the panel, and
  `contain: inline-size` on `.date-list__meta` in `DateList.astro` is
  load-bearing: without it the `nowrap` meta line's own max-content (~100px wider
  than the rows) wins, the panel jumps to the 92vw cap, and the rows overflow it
  instead. The meta then just ellipsises. Do not "fix" the scroll by capping the
  row's `min-width` or un-wrapping the meta.

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

## Species Wikidata QIDs

Every entry in `src/content/species/` carries a `wikidataId`. `npm run
resolve-species-wikidata` re-derives them and reports anything it could not
resolve; `--write` persists. All 47 populated entries currently resolve.

- **Verification is exact, not fuzzy.** `scripts/resolve-species-wikidata.mjs`
  runs `wbsearchentities` per scientific name, then requires a candidate's
  `taxon name (P225)` to equal that name case-insensitively, and checks
  `taxon rank (P105)` is species `Q7432`. A search hit can be a synonym, a
  misspelt name or a homonym, so a hit is only ever a _candidate_ — the claims
  are what decide. Never store a QID off a search result alone.
- **Do not use `P1420` to decide whether an item is a synonym.** On a species
  item it means "this taxon _has_ synonyms", which is true of nearly every real
  species, so flagging on it marks all 47 entries and tells you nothing. "Is a
  synonym" is the inverse property, which is not queryable from the item.
- **`P141` taxon status is reported, not rejected.** The five entries carrying
  it have IUCN statuses (least concern, near threatened), not taxonomic
  problems; treating any `P141` as disqualifying would reject valid species.
- **The write path splices one line into the file, it does not re-serialise.**
  `JSON.stringify(doc, null, 2)` followed by Prettier expanded objects that were
  deliberately kept inline (`"commonName": { "en": "Cep", "de": "Steinpilz" }`),
  turning a one-line change into a reformat of all 47 files — Prettier preserves
  the line breaking it is handed and will not collapse them back. `upsert()`
  inserts the key textually; keep it that way.
- Searches are cached in `.cache/wikidata-species-search.json` (gitignored)
  because the endpoint rate-limits; the two calls during a dry run do return
  `429`, which the retry handles with `Retry-After`. Claims are fetched in
  batches of 50, not per item.
- **The API client is shared: `scripts/lib/wikidata.mjs`.** The resolver, the
  species fetcher and the icon downloader all retry and parse claims through it,
  because a 429 fix that lands in only one script leaves the others flaky.
  `entities(qids)` returns a Map keyed by QID and **takes an entity**, so
  `stringsOf(e, 'P225')` — not `stringsOf(e.claims, 'P225')`, which reads
  `claims.claims` and silently returns nothing. That mistake is invisible where
  a fallback exists: it emptied `media`/`externalIds` on all 47 species while
  `taxonName` still looked right via its `?? scientificName` default.
- Three directories have **no `index.json`** and so are not collection entries:
  `coprinopsis-nivea`, `guepinia-helvelloides`, `tolypocladium-ophioglossoides`.
  The resolver prints them so a genuinely empty entry is not mistaken for a
  lookup failure.

## Species Wikidata snapshots

`src/data/wikidata/species/` holds one generated TS module per species, keyed by
QID, plus an `index.ts` barrel. `npm run update-species-wikidata` rebuilds them
from the collection's `wikidataId`; `--force` rewrites unchanged files.

- **Everything is generated — do not hand-edit those 47 modules.** Each carries a
  `// Generated by ... do not edit by hand` header. The hand-written
  `Q131227.ts` prototype was removed once this covered it.
- **Join through `speciesEntry.data.wikidataId`**, not through the `slug` field
  on the snapshot. `speciesWikidata` is keyed by QID; `slug` is carried only so a
  snapshot is identifiable when read on its own. `wikidataId` is _optional_ in
  the schema, so a lookup can legitimately miss.
- **The enum types are load-bearing, and every value currently fits.** An
  unfamiliar QID is deliberately _omitted_ from the output rather than emitted as
  a bare string, so `astro check` fails on the now-missing required property.
  The fix is to add the QID to `morphology-types.ts`, never to widen the type
  to `string`. As of this writing all 47 species' P783–P789 values are enum
  members, so the generator reports none missing.
- **Empty means "Wikidata says nothing", which is not the same as a negative.**
  Coverage is partial: `P18`/`P373` 44 of 47, `P784` 29, `P788` 29, `P789` 34,
  `P141` 5. Arrays are always present (possibly empty) so callers can map over
  them, but an empty `edibility.values` must never render as safe to eat.
- **`media.images` is not licence-vetted.** `icons.ts` carries per-file author
  and licence because those images are displayed; the species snapshots only
  record Commons filenames. Fetch licences before showing them.
- **No external-id URLs are baked in.** `externalIds` stores pid + source name +
  opaque value only; resolving each site's URL pattern is left to the caller so
  a guess cannot 47 wrong production links.
- Rendering is incremental: unchanged modules are skipped, and a module whose
  species was deleted is **pruned**, so nothing stale survives a content delete.

## Wikidata morphology data

`src/data/wikidata/` holds a typed snapshot of the fungal morphology properties
Wikidata models, plus the Commons drawings that illustrate them. It is **not** a
content collection — it is plain TS so `astro check` validates it.

- `morphology-types.ts` is the single source of truth: one `as const` map per
  property, keyed by a readable name and valued by QID, derived from the
  property's `one-of constraint` (`P2302` → `P21510859` → items at `P2305`).
  Because these are literal-typed `as const` objects, a QID that is not a legal
  value of its property is a **compile error**, not a runtime surprise. Adding a
  value here is all that is needed for `fetch-wikidata-icons.mjs` to pick it up.
  - `P783` hymenium type, `P784` cap shape, `P785` hymenium attachment,
    `P786` stipe character, `P787` spore print color, `P788` ecological type,
    `P789` edibility.
  - **`P787` spore print color is only partly illustrated** — 9 of its 22 values
    carry an `icon (P2910)` (yellow, pink, olive, buff, purple, blackish-brown,
    olive-brown, pinkish-brown, purple-black) and the group is fetched; the other
    13 are reported in `missingIcons`. Wikidata gained these drawings after this
    group was first written as empty, so the count is data-dependent, not a
    constant: re-run the fetcher rather than assuming it. Never fill the gap by
    treating a colour name as an image, and never reach for `P18` — see the
    `P18` fallback warning above.
  - Three of the nine spore-print files (blackish-brown, pinkish-brown, purple)
    have an **empty `Artist` field on Commons**, so their generated entry is
    `author: null` while `license` is `CC BY-SA 3.0`. That is faithful to the
    source, not a parsing gap — checked against the API — but it means those
    three cannot be credited by name from the metadata alone.
- `icons.ts` is **generated** — `npm run update-wikidata-icons`, never hand-edit.
  Each entry carries its Commons `source` URL, `license` and `author`, because
  52 of the 61 files are CC BY-SA and need attribution. The local files under
  `icons/` are the **unmodified originals**, byte-identical to Commons, kept that
  way on purpose so they can be restyled later without re-downloading.
- Icons come from `icon (P2910)` **only**. Do **not** fall back to `image (P18)`:
  on these value items P18 is whatever photo or clipart illustrates the article,
  so the fallbacks are a field photo of _Harposporium_ on a dead nematode
  ("nematophagous fungus"), a photo of a plate of fried mushrooms ("edible when
  cooked") and a cooking icon ("edible mushroom"). A value with no `P2910` is
  recorded in `missingIcons` instead, which is the honest outcome.
- **`sRGB color hex triplet (P465)` is fetched for every targeted value, icon or
  not**, and written to `valueColors` plus a `colorsByQid` lookup. A swatch is the
  only representation 13 of the 22 spore print colours can ever have, so this is
  stored independently of the icon: 18 of the 22 values carry a colour (25
  triplets). The other groups carry none — only colour values have one.
  - **Icon and colour are independent, so neither is universal.** Three spore
    print values have a drawing but no triplet (blackish-brown, pinkish-brown,
    yellow-brown), and the 13 with no drawing mostly do have one. A value can have
    a glyph, a colour, or both, so never treat one as implying the other.
  - **Some values have several triplets** (salmon 2, buff 2, yellow-orange 2,
    purple-brown 5), all at `normal` rank — there is no preferred statement to
    prefer. Every triplet is kept, sorted, and the array is documented as "not a
    single canonical colour"; picking one would be our invention, not Wikidata's.
  - Wikidata stores a bare uppercase triplet (`FFFF00`); the generator adds the
    `#` for CSS and **rejects anything that is not 6 hex digits**, logging the QID
    rather than emitting an invalid colour.
  - The sorting is what makes the export deterministic: SPARQL row order is not
    stable, and without it a re-run produced a spurious diff. Assert idempotence
    by re-running the fetcher and diffing `icons.ts` — it must be byte-identical.
  - **Rendered through `ValueMark.astro`**, which prefers the drawing and falls
    back to a disc of the colour, so a value is never bare text when Wikidata
    gives us either. It is drawn as an actual spore print: `border-radius: 50%`
    with a `repeating-conic-gradient` of ~120 gill lines converging on the
    centre. A transform cannot draw a gill pattern — it moves and scales a
    picture — hence the conic gradient.
    - **The gills live on `::before`, not on the element**, because they are
      masked and a mask applies to the whole element: putting them on the element
      would drag the fill and the inset ring into the mask too. The fill keeps its
      exact colour instead of being tinted towards the paper by a rim fade.
    - **Two mask layers, multiplied with `mask-composite: intersect`**, since both
      effects vary with radius and one layer cannot express them. A radial one
      carries the density gradient (dense at the middle, tapering to the rim, and
      clearing the very centre where lines that close would merge into a blob); a
      `repeating-radial-gradient` one cuts them into dashes, whose pixel lengths
      subtend a shrinking angle inwards, so they read as dots near the middle and
      as short strokes further out. Its absence degrades to `add` — the dashes
      union back in and only the taper is lost, never a broken mark. The `-webkit-`
      keywords differ (`source-in`), hence both declarations.
    - **Assert the profile by measuring, not by eye** — at 78px the inner gills
      are sub-pixel and antialiased, so tuning by eye is unreliable. Sample the
      rendered disc: the luminance stddev per annulus should peak around 10-16px
      and fall monotonically to the rim, and a ray outward along one gill should
      show ~14 brightness alternations with a solid line showing 0-1. Beware a
      share-of-paper-pixel threshold as the metric: it reads faint texture on a
      dark fill as absent.
      Where a value has several triplets the fill is banded into equal
      stripes of all of them rather than picking one, and the element's
      `aria-label`/`title` carry the raw codes: "buff", "tan" and "cream" are
      ambiguous in a way their hex codes are not.
  - **The paper is picked per value by measured WCAG contrast**, not by
    thresholding on luminance: near-black under a light print, near-white under a
    dark one. The two candidates are not symmetric about 0.5 — the +0.05 offset
    moves the crossover to ~0.22 relative luminance — so `olive` (0.21) and `tan`
    (0.48) both take near-black even though `tan` reads as a light colour. A
    value with several triplets is scored on its **worst** one, so no band can
    disappear into the sheet. Worst case across all 18 values is 4.72:1 (`olive`,
    against 3.91:1 on the other sheet). The spokes and rim fade use the paper
    colour, never the fill: painting the fill would tint it, and the disc would
    stop being the colour Wikidata recorded.
  - **A `var()` holding a bare colour silently drops a whole
    `background-image` list.** A colour is not a valid `<image>`, and because
    substitution happens at computed-value time, one bad layer invalidates the
    whole declaration and leaves `background-image: none` with no error.
    `--spore-fill` is therefore always a gradient, even for one triplet.
  - The disc is 78px on a `--bg-surface` page, so a near-black sheet has no edge
    of its own; the 1px inset `box-shadow` ring is what defines it. Keep that ring
    if the paper choice is ever revisited.
  - **The mark's sizing lives in `ValueMark`, not in the caller.** Astro's scoped
    styles carry the _rendering_ component's scope attribute, so a class a caller
    passes to `<ValueMark class=...>` matches nothing in the caller's stylesheet.
    `variant="row"` (5.6rem) and `variant="chip"` (1.4rem) own it instead; do not
    move those rules back into `SpeciesData.astro`.
  - `colorsFor()` returns every triplet, sorted, and caches; a caller must handle
    the empty array (four values have neither a drawing nor a colour) rather than
    assuming one of the two exists.
- Wikidata's own data has gaps; both lists are exported so the UI can degrade
  deliberately rather than rendering a broken image:
  - `missingIcons` (17) — no `P2910`: `Q357006` (nematophagous fungus), three
    edibility values (`Q654236`, `Q62102033`, `Q1686195`) and 13 spore print
    colours. Both counts are data-dependent, not constants: re-run the fetcher
    rather than hard-coding them.
  - `iconsToReview` (1) — `Q62023127` (semi-spherical cap) has no `P2910`, and
    its `P18` is the _convex_ cap icon, i.e. a different value. Deliberately not
    downloaded.
- The script imports `../src/data/wikidata/morphology-types.ts` directly, so it
  relies on Node's type stripping (as `generate-thumbnails.mjs` already does).
- `commons.wikimedia.org` answers **429** readily from a shared IP. The script
  batches metadata lookups 20 titles at a time, throttles, and backs off
  exponentially (honouring `Retry-After`); a run of 52 files takes ~1 min.
  Metadata is fetched for every file even when the file already exists, so a
  plain re-run still costs two API calls per batch but downloads nothing.
- This is the only build-independent network fetch besides `prebuild`
  thumbnails, and it is **not** wired into `prebuild`/`predev` — it needs
  Commons, so a network failure must never be able to fail a build.

## Species & location filtering

`SpeciesFilter.astro` filters the two pages that list species by property: the
mushroom index and the sighting map. Both pass `unit` (`species` | `sighting`)
and the result is that the same facet reads truthfully on each page — "gills (31)"
species on the index, "gills (68)" markers on the map. Add a third page, and it
must pass a unit rather than reuse the counts.

- **The matching rules live in `src/lib/species-facets.ts` and nowhere else.**
  That module is imported by the component's `<script>` _and_ by
  `species-facets-build.ts`, so the two pages cannot drift on how a selection is
  matched or encoded. Do not re-implement it inside a page or a component.
- **`species-facets-build.ts` is the only build-time half, and it must stay out of
  the client bundle.** The seven Wikidata facets are read at build time and
  flattened into a JSON payload embedded in the panel as a `<script
type="application/json">`. The 232 KB of species snapshots never reach the
  browser; `SpeciesFilter`'s own chunk is ~4 KB. Note the `<` → `\u003c` escape on
  that payload, which is JSON-legal and would otherwise close the script element.
- **Semantics: one conjunction, everywhere.** `Selection` is
  `Partial<Record<FacetKey, string[]>>` — a plain list of chosen values per
  property, with no include/exclude split and no mode. An item has to carry
  **every** selected value, so selecting gills _and_ pores in one property
  matches nothing; a property absent from the selection passes everything, so an
  empty selection keeps every unit. There is no `FacetSelection`, `MatchMode`,
  `DEFAULT_MODE` or `MODE_PARAM` any more — do not reintroduce them. This was
  deliberately simplified from a tri-state AND/OR filter: the extra states were
  the main thing standing between a reader and using it.
  - **The chip counts are the early-warning system for that.** A chip's number is
    `countWithValue()` — _how many would match if I selected this_ — so an
    impossible combination reads `0` in red **before** the click, not after. Do
    not "fix" a zero count by making the intersection permissive; the zero is the
    honest reading of AND and the reader deserves to see it coming.
  - **Missing data is a first-class value** — `NO_DATA` (`~`), selectable like
    any other, because "no claim on Wikidata" is a real answer to "what are the
    edible ones". `~` under AND is a real conjunction, not a special case:
    `[~, 'Q1']` is "no claim _and_ Q1", which nothing can satisfy, so it yields 0
    like any other impossible pair.
  - `toggleValue(list, value)` is a two-state membership toggle and is the single
    write path behind the chips. A property whose list empties is **deleted**
    rather than kept as `[]`, so `selectionIsEmpty` and `encodeSelection` do not
    each have to know that "empty list" and "no key" are the same thing.
- **The unit is decided per sighting, not per species.** `matchesSighting` takes
  one sighting row and tests its species' Wikidata values _and_ its own location;
  a species card is then shown when at least one of its sightings survives. That
  is what makes the location property work on the index, and it is also why
  selecting a location cannot blank the map: each marker is tested on its own
  (sibling sightings of a surviving species are not pulled in).
- **A sighting's identity is its Astro collection id (`{date}/{species-slug}`),
  and `MapVector` features carry that same string as `properties.slug`.** The
  filter and the map meet on those ids, so the two must stay the shape Astro's
  loader produces — a hand-rolled `path.basename` of the parent directory
  collapses every sighting of a species onto one key and silently drops markers.
  Assert the intersection is the full sighting count after touching either side.
- **Filtering republishes, it never refits.** `MapVector` listens for
  `myco:filter` and calls `source.setData()` so clusters recompute; the fixed
  15 km extent stays. The selection is _also_ written to
  `document.documentElement.dataset.mycoFilter`, because the map may not have
  loaded yet when the first selection happens and the map's `load` handler then
  has to catch up. Removing either channel breaks one of the two orderings.
- **URL state is `?f=facet:value,value2;facet2:…`** — `;` between facets, `,`
  between values, `~` for no data. It uses `history.replaceState`, because a
  drill-down is half a dozen clicks and pushing each would fill the history stack
  with filter states; `popstate` re-reads it. `decodeSelection` rejects unknown
  facet keys but trusts unknown _value_ ids, so a stale shared link can select a
  chip that no longer exists. It also **drops any `!`-prefixed token**, so a link
  written before exclusion was removed still loads — minus the exclusions, which
  are no longer a thing the panel can express.
- **Progressive enhancement, like the mobile rail toggle:** the panel ships
  `hidden` and the script reveals it, so with JS off both pages simply show
  everything — the correct fallback for a filter. Every chip is a real `<button>`
  with `aria-pressed`; there is no hover-only affordance, and the one rule is
  stated in a single `filter.hint` sentence rather than a legend of glyphs.
- **Counts are per unit, dynamic, and hidden once selected.** A chip's number is
  `countWithValue()`: _how many would match if I selected this_, not the value's
  static total. With nothing selected it equals the static total, and every click
  narrows all 71 chips to the question actually being asked. Two consequences
  that look like bugs and are not: a number can go **up** as the page narrows
  (`medicinal` selected ⇒ the `poisonous` chip reads 19, because that is now the
  count of species that are both), and a value already in the selection is blank
  so it cannot shift under the cursor. A selected chip shows **no** count at all —
  it is no longer a question, and the number is already in the header.
  `countSurvivors()` is the single pass behind the header, the per-card counts
  and the published sighting set, so the three cannot disagree; it is in
  `species-facets.ts`, not the component, because a chip count computed from a
  different pass than the card visibility is a silent off-by-one.
- **Targets are sized for touch, not just for looks.** Chips, property summaries,
  the header summary and `[ Reset ]` are all `min-height: 2.25rem` (36px) and go
  to `2.75rem` (44px) under `@media (pointer: coarse)`. A chip is the whole point
  of the panel; at 24px it is a miss on a phone. Selected chips **invert** —
  `--accent` fill with `--bg` text — rather than taking an accent-coloured
  outline, because a fill survives greyscale and colour-blindness the way an
  outline does not (the same invert `.tui-card__arrow` uses on hover).
- **The panel reserves the space its own state changes.** A filter that
  reflows as it is used makes the reader chase the control they just pressed, so
  two slots are fixed rather than sized to their content. `.value__count` keeps
  `min-width: 1.75rem` + `tabular-nums` and **must not** regain a
  `.value__count:empty { display: none }` rule: the count changes on every click
  and goes blank on the selected chip, so a content-sized slot re-flows all 71
  chips. `[ Reset ]` is toggled with `data-visible` → `visibility: hidden`, not
  the `hidden` attribute — `display: none` removed its box, so the first
  selection pushed a button into the header and dropped the page by a line.
  `visibility: hidden` also keeps it out of the tab order and the accessibility
  tree, so an unfiltered panel shows a gap where the button will appear.
  Anything else in the header that appears on selection (`[data-filter-names]`,
  a section's `[data-facet-badge]`) has to be pinned by `margin-left: auto` on
  what follows it, so its arrival does not move its neighbours.
- **`setValue(facet, value)` is the single write path**, so the URL, counts,
  cards and map always follow from one click handler. Do not add a second.
- **`paintFacets` only ever opens a section, never closes one.** It opens a
  property that holds a selection — so a shared `?f=…` link arrives showing
  exactly the chips that are set — and never touches a section in
  `closedByUser`, which is populated from each section's own `toggle` event.
  Otherwise a reader's collapse would be undone by the next click anywhere else
  in the panel.
- **The panel is a `<details>` that ships closed, and so do its eight sections.**
  Collapsed it is one summary line, and a reader who never filters sees content
  rather than 71 chips; the sections are closed so expanding the panel once
  reveals a readable list of eight properties instead of every chip at once. A
  shared `?f=…` link force-opens the panel, because arriving at a mysteriously
  filtered page with the filter hidden is the one outcome worth avoiding.
- **The selection is restated in words, not as a second control set.** The
  header carries `[data-filter-names]` — the labels of the selected values,
  comma-joined, clipped with `text-overflow: ellipsis` so a long selection cannot
  push the count and `[ Reset ]` off the line. `paintNames()` is the only writer.
  It is deliberately not chips: the chips inside already carry the state, and a
  removable copy in the summary would be two places to read and two things that
  can disagree.
- **A bare `/* */` in an Astro template is not a comment** — it renders as text.
  It must be `{/* */}`, or the comment is printed on the page. `astro check` does
  not catch it, so assert it by scanning `dist` bodies for `/*`.

## Header search

`SiteSearch.astro` is a jump-to-species combobox in the shared header. It is
**not a filter**: it has no `?q=`, and it neither reads nor writes the facet
selection's `?f=`. The two features share nothing but the bar they sit in, so
there is no coupling to keep in sync.

- **The index is a static file, fetched on first focus** — `/search-index.json`
  from `src/pages/search-index.json.ts`. Do **not** inline the payload into
  `Layout.astro`: the component ships on every one of the built pages, so that
  would add ~6.5 KB raw / 2.1 KB gzipped to all of them, mostly to the backlog
  day pages that never search. The invariant to assert after touching this is
  that no built HTML contains the payload (`"scientific":`).
- **It is not localized.** Every record carries `en` and `de`, and the client
  already knows the locale, so one file serves both locales and stays cached
  when the reader switches. Nine of the 58 entries have no German name, so each
  name falls back to the other — never render an empty suggestion.
- **`search-index-build.ts` is the only build-time half and must stay out of the
  client bundle**, mirroring `species-facets-build.ts`. Neither of its imports is
  a runtime import, which is also what lets `node --experimental-strip-types`
  load it from a plain script.
- **`fuzzy-search.ts` is the only half the browser runs**, and it is DOM-free so
  `scripts/check-search-ranking.mjs` can rank with the _same_ function. Run
  `npm run check:search` after touching the matcher or any species name: the
  thresholds are tuned, and loosening `MIN_DICE` or dropping `MIN_FUZZY_LEN`
  makes the search feel cleverer while making it wrong, with nothing in the type
  system objecting.
- **The scorer has four layers, and two rules that are there because of
  measurement, not convention.** Layers are substring → whole-token → all-tokens
  → fuzzy (trigram Dice, boosted by an OSA distance of 1), so a real word match
  can never be outranked by trigram luck. Then:
  - **Fuzzy matching requires a query token of ≥ 4 characters.** Below that a
    trigram means almost nothing — without the floor, `gift` matches _Common
    Split Gill_ on two trigrams. Short queries stay substring-only and silently
    find nothing, which is the honest reading of a query that asks nothing.
  - **Every query token must clear the threshold, and the worst one decides.**
    Taking the best token would let `edulis zzzz` match _Boletus edulis_.
- **Never say "no species found" when there is no answer to give.** The empty
  row appears only for a query long enough to have been asked. A one-character
  query, and the window before the index has loaded, both stay silent — the
  first has not been asked anything, and the second would otherwise flash a lie
  at the reader for the length of the request.
- **The empty row is a sibling of the listbox, not an `<li>` inside it.** A
  `role="listbox"` may only contain options, and a list with no options must be
  `aria-expanded="false"`, not expanded onto a message.
- **Focus never leaves the input.** The active option is tracked with
  `aria-activedescendant`, so `Enter` is the only way to commit one and
  `Escape` always has something to return to. `Enter` always `preventDefault`s:
  there is no search _page_, so submitting the form would GET a URL that does
  not exist.
- **Options carry an explicit `aria-label`.** The two visible lines are
  `display: block`, so `textContent` concatenates them — and that concatenation
  _is_ the accessible name, which a screen reader announces as one run-on word
  ("Oak boleteAnhängsel-Röhrling").
- **The control ships `hidden` and its script reveals it**, the same contract as
  `.nav__date` and `SpeciesFilter`: with JS off there is no search box rather
  than a field that goes nowhere.
- **Below 768px the field overlays the bar instead of growing it.** Growing it
  would change `--header-h`, and the sticky rail, the mobile drawer's top and
  `:target` scroll-margin all derive from that token. `align-self: stretch` on
  `.search` is what puts the listbox's `top: 100%` on the bottom of the _bar_
  rather than the bottom of the input.
- **The fetch is lazy, memoised and fired on `pointerdown` of the mobile glyph as
  well as `focus`.** Assert by counting `performance.getEntriesByType` for
  `search-index`: 0 before the first interaction, 1 after, 1 for the rest of the
  session — including a locale switch.
- `dist/index.html` is Astro's i18n redirect stub and renders no header, so it is
  the one built page legitimately without the control.

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
