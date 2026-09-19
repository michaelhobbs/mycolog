# myco.log

A bilingual (EN/DE) static site for recording and identifying mushroom sightings
around Garmisch-Partenkirchen in the Bavarian Alps. Built with **Astro**.

## Highlights

- **Six static content collections** for species, locations, authors, sightings,
  an identification backlog, and declarative news events.
- **Interactive vector map** (`MapLibre`) showing every sighting with clustered,
  carousel popups, plus on-the-fly elevation contours and hiking overlays.
- **Dev-only identification workflow**: import unknown photos into the backlog and
  promote each item to a full sighting (species + location + notes) via a small
  local Express API.
- **RSS feeds** (`/rss.xml`, `/{locale}/rss.xml`) built from the news collection.

---

## Project Structure

```text
/
├── public/
│   ├── favicon.ico / favicon.svg
│   └── images/{author}/{find}/    # Drop source photos here (HEIC/JPG) to add to the backlog
├── scripts/
│   ├── api.mjs                    # Dev-only API (:4322): identify, set cover, pin backlog location
│   ├── import-backlog-public.mjs  # Converts public/images → backlog items (+ news events)
│   ├── news-events.mjs            # appendNewsEvent() — shared by the API, import & backfills
│   └── backfill-*.mjs             # One-off migrations (authors, dateIdentified, news history)
├── src/
│   ├── content/
│   │   ├── authors/{slug}/        # Author reference data (name)
│   │   ├── backlog/{NN}/          # Unidentified items (authors, dateSpotted, optional GPS, images)
│   │   ├── locations/{slug}/      # Shared location reference data
│   │   ├── news/{date}-{type}-{NN}/ # Declarative news events
│   │   ├── sightings/{DATE}/{slug}/ # Per-observation data + photos
│   │   └── species/{slug}/        # Shared species reference data
│   ├── components/
│   │   ├── BackLink.astro         # Back link (prev-page aware)
│   │   ├── BacklogIdentify.astro  # The dev-only identify form
│   │   ├── DateIndex.astro        # Day index list on log pages
│   │   ├── Lightbox.astro         # Fullscreen photo viewer
│   │   ├── LinkRow.astro          # Nav back-links row
│   │   ├── LocationPicker.astro   # Click-to-pin map for the identify form
│   │   ├── LocationThumbMap.astro # Small static map per location
│   │   ├── MapVector.astro        # The full sightings map
│   │   ├── MiniMap.astro          # Compact map variant
│   │   ├── MushroomCard.astro     # Species summary card
│   │   ├── NewsFeed.astro         # News feed on home
│   │   └── Notice.astro           # Foraging warning banner
│   ├── layouts/
│   │   └── Layout.astro           # Shared page shell / navigation
│   ├── lib/
│   │   ├── news.ts                # News → day feed + RSS items
│   │   └── sightings.ts           # Enriches sightings with species data
│   ├── i18n/
│   │   ├── en.ts / de.ts          # EN & DE strings
│   │   ├── index.ts               # Locale helpers (getTranslations, formatDate)
│   │   └── helpers.ts             # l10n() localized-string picker
│   ├── pages/
│   │   ├── index.astro            # Root → redirects to /{default-locale}
│   │   ├── rss.xml.ts             # RSS feed (default locale)
│   │   └── [locale]/
│   │       ├── index.astro        # Home
│   │       ├── map.astro          # Map page
│   │       ├── log.astro          # Day index
│   │       ├── log/[date].astro   # A single day's sightings
│   │       ├── log/[date]/[slug].astro # A single sighting
│   │       ├── identifications.astro / identifications/[date].astro
│   │       ├── locations/index.astro / locations/[slug].astro
│   │       ├── mushrooms/index.astro / mushrooms/[name].astro
│   │       ├── backlog.astro      # Chronological backlog list
│   │       ├── backlog/[slug].astro # DEV-only identify form
│   │       └── rss.xml.ts         # Locale-specific RSS feed
│   ├── types/
│   │   └── mushroom.ts            # Shared TypeScript types
│   └── content.config.ts          # Content-collection schemas (see below)
├── astro.config.mjs               # i18n routing, site, dev proxy → api.mjs
├── prettier.config.ts
└── package.json
```

### Key commands

| Command                  | Action                                          |
| :----------------------- | :---------------------------------------------- |
| `npm install`            | Install dependencies                            |
| `npm run dev`            | Start dev server at `http://localhost:4321`     |
| `npm run build`          | Build the static site into `./dist/`            |
| `npm run preview`        | Preview the production build                    |
| `npm run typecheck`      | Run `astro check`                               |
| `npm run format`         | Prettier write                                  |
| `npm run format:check`   | Prettier check                                  |
| `npm run update-backlog` | Import `public/images/**` into the backlog      |
| `npm run api`            | Start the identify API (`node scripts/api.mjs`) |

Dev server + identify API are managed with background mode:

```
astro dev --background
astro dev stop | status | logs
node scripts/api.mjs        # runs the API in the foreground
```

> Production must set `SITE_URL` at build time so absolute links (e.g. the RSS
> feed) point at the real domain instead of `http://localhost:4321`:
>
> ```
> SITE_URL=https://example.com npm run build
> ```

---

## Content Collections

`src/content.config.ts` defines six collections. All text that must render in
both languages is stored as a _localized string_ object:

```ts
{ "en": "English text", "de": "Deutscher Text" }
```

### `species` — shared species reference data

Location: `src/content/species/{slug}/index.json`

Sightings reference a species **only by slug**; the shared data lives here once.

```jsonc
{
  "scientificName": "Amanita muscaria",
  "commonName": { "en": "Fly Agaric", "de": "Fliegenpilz" },
  "determiningFeatures": [
    { "en": "Bright red cap with white spots", "de": "Leuchtend roter Hut mit weißen Punkten" },
  ],
  "notes": { "en": "…", "de": "…" }, // optional
  "habitat": { "en": "Birch forest", "de": "Birkenwald" }, // optional
  "edibility": { "en": "Psychoactive", "de": "Psychoaktiv" }, // optional
  "cover": { "sighting": "2026-09-12/amanita-muscaria-2", "index": 0 }, // optional
}
```

`cover` points at one image of one sighting of this species (`{date/slug}` +
image index); the species index falls back to that sighting's first image.

### `locations` — shared location reference data

Location: `src/content/locations/{slug}/index.json`

Sightings reference a location by `locationSlug`; the shared data lives here once.

```jsonc
{
  "name": { "en": "Kankerbach", "de": "Kankerbach" },
  "description": { "en": "…", "de": "…" }, // optional
  "forestType": { "en": "…", "de": "…" }, // optional
  "soilType": { "en": "…", "de": "…" }, // optional
  "center": { "lat": 47.48, "lng": 11.15 }, // optional
}
```

### `authors` — contributor reference data

Location: `src/content/authors/{slug}/index.json`

```jsonc
{ "name": "Michael" }
```

### `sightings` — per-observation data

Location: `src/content/sightings/{DATE}/{species-slug}/index.json`

```jsonc
{
  "species": "schizophyllum-commune", // references a species slug
  "locationSlug": "kankerbach", // references a location slug
  "authors": ["michael"], // one or more author slugs
  "dateSpotted": "2026-08-22", // YYYY-MM-DD
  "dateIdentified": "2026-09-01", // optional
  "location": { "lat": 47.483453, "lng": 11.149244 },
  "images": ["./images/IMG_4163.jpg", "./images/IMG_4164.jpg"], // relative to this folder
  "notes": { "en": "…", "de": "…" }, // optional
}
```

The images live in `…/{DATE}/{slug}/images/` next to `index.json`. The first
image is the sighting's cover (the map popup, log, and species pages use it).

### `backlog` — unidentified items awaiting identification

Location: `src/content/backlog/{NN}/index.json` (numeric slug, e.g. `01`, `30`)

```jsonc
{
  "authors": ["michael"],
  "dateSpotted": "2026-08-22", // YYYY-MM-DD (taken from the photo's EXIF date)
  "location": { "lat": 47.4843, "lng": 11.15283 }, // optional, taken from EXIF GPS or pinned manually
  "images": ["./images/01.jpg", "./images/02.jpg"], // converted to JPG
}
```

Only `authors` + `dateSpotted` + images are required; species/location are
filled in when the item is promoted to a sighting.

### `news` — declarative news events

Location: `src/content/news/{date}-{type}-{NN}/index.json`

Events are appended by `scripts/news-events.mjs` (`appendNewsEvent`) and feed
the home page and the RSS feeds — **don't hand-edit them**. Four event types:

```jsonc
{ "type": "backlog-added", "date": "2026-09-03", "photoDate": "2026-08-22", "count": 3, "items": ["01", "02", "03"] }
{ "type": "identified", "date": "2026-09-03", "sightings": ["2026-08-07/amanita-muscaria"] }
{ "type": "new-species", "date": "2026-09-03", "slugs": ["hydnellum-peckii"] }
{ "type": "new-location", "date": "2026-09-03", "slugs": ["kankerbach"] }
```

---

## Adding items to the backlog

Two ways:

### 1. Manual

Create a numeric folder under `src/content/backlog/`, e.g. `31`, with an
`index.json` (authors, `dateSpotted`, optional `location`) and converted JPGs:

```
src/content/backlog/31/
├── index.json        # { "authors": ["michael"], "dateSpotted": "2026-08-22", "images": ["./images/01.jpg", …] }
└── images/
    ├── 01.jpg
    └── 02.jpg
```

### 2. Automatic (`npm run update-backlog`)

1. Drop **HEIC or JPG** photos into `public/images/{author}/{find}/`, where
   `{author}` is the contributor's name and `{find}` a subfolder per "find".
2. Run `npm run update-backlog`.

`scripts/import-backlog-public.mjs` then, for every `{find}` subfolder:

- picks the **next free numeric id** (highest existing backlog folder + 1),
- creates an `authors` entry if that contributor is new,
- **derives `dateSpotted` from the photo's EXIF** capture date (via `mdls`),
- **derives GPS `lat`/`lng` from the photo's EXIF** GPS tags when present,
- **converts the HEIC photos to JPG** (`sips`) as `images/01.jpg…NN.jpg`,
- writes the item's `index.json`, and
- **appends a `backlog-added` news event**.

The HEIC sources in `public/images/` are left in place; you can remove them
after a successful import.

---

## Promoting a backlog item to a sighting (dev workflow)

Identification is a **dev-only** workflow: the identify pages
(`/{locale}/backlog/{slug}`) are only generated in dev — `astro build` skips them.

### Start the two servers

```sh
node scripts/api.mjs                 # identify API  → http://localhost:4322
astro dev                            # Astro dev server → http://localhost:4321
```

`astro.config.mjs` proxies `/myco/api` → `http://localhost:4322`
(`vite.server.proxy`), so the form submits through the dev server.

### Identify an item

1. Open `/{locale}/backlog` (the chronological list of unidentified items).
2. Click **identify** on an item → the identify form:
   - **Date** — pre-filled from the photo's `dateSpotted` (editable).
   - **Species** — pick an existing one, or add a new species (scientific +
     common names EN/DE), which creates a `species` entry on submit.
   - **Authors** — the backlog contributors are pre-selected; add new authors
     (semicolon-separated) as needed.
   - **Location** — choose a known location name or type a new one, and
     **click the map** to drop a pin (writes `lat`/`lng` to a hidden input).
   - **Notes** — optional EN + DE notes.
3. Submit → the API (`scripts/api.mjs:POST /api/sightings`):
   - creates the sighting under `src/content/sightings/{date}/{slug}/`,
   - **copies the item's images** into it (renamed `{speciesSlug}{n}.jpg`),
   - optionally creates the new `species` / `location` / `authors` entries,
   - **removes the backlog item**, and
   - **appends `identified` (+ `new-species` / `new-location`) news events**.

Other dev-only API endpoints:

- `POST /api/sightings/cover` — reorders a sighting's images (first = cover).
- `POST /api/species/:slug/cover` — sets a species' `cover` reference.
- `POST /api/backlog/:id/location` — pins/removes a backlog item's location.

---

## RSS feeds

Feeds are generated from the `news` collection at `/rss.xml` (default locale)
and `/{locale}/rss.xml` (`src/lib/news.ts` builds the day feed and items).
Links are absolute and derive from the `site` config — see the `SITE_URL`
note under [Key commands](#key-commands).

---

## How the map works

`src/components/MapVector.astro` renders a **MapLibre GL** vector map
(`maplibre-gl` + `maplibre-contour`).

### Data flow

- At build/serve time the component receives `EnrichedSighting[]`
  (`src/lib/sightings.ts`) — every sighting joined with its species data.
- Each sighting's images are pre-processed via `getImage` (320 px) and the whole
  payload is embedded on the page as JSON on the map container element
  (`<div id="map" data-sightings="…">`), already localized to the active locale.
- The inline `<script>` parses that JSON and renders it client-side.

### Base style & palette

- Loads the **OpenFreeMap** `fiord` style (vector tiles from OpenMapTiles/OSM).
- A `applyPalette()` pass re-paints the base layers to a dark-green terminal
  look: dark woods/residential, teal water, green-toned roads, and accent
  dashed hiking paths; several layers (parks, city names, etc.) are toggled or
  recolored.

### On-the-fly elevation contours

- A `maplibre-contour` `DemSource` pulls free AWS **Mapzen "terrarium"** raster
  DEM tiles (`elevation-tiles-prod`, z0–14, no key).
- It registers a custom Maplibre protocol via `setupMaplibre`, then a vector
  `hiking-contours` source is added whose URL is generated by
  `demSource.contourProtocolUrl({ thresholds: {12:[40,200], 13:[20,100], 14:[20,50]} })`.
- The generated `contours` vector layer is rendered as two line layers
  (minor/major) based on a `level` property.

### Hiking overlays

- **Peaks** — `mountain_peak` summits (class `peak`, rank ≤ 4) as icons with
  `name + elevation m`.
- **POIs** — shelters, guideposts, viewpoints, springs, etc. (minzoom 14).
- **Trail labels** — named `transportation_name` paths (class `path`), placed
  along the line.

### Sightings markers & clustering

- Sightings are added as a **GeoJSON** source with `cluster: true`
  (`clusterRadius: 44`) — MapLibre's **Supercluster** groups nearby/overlapping
  points; clustering stays enabled at all zooms so identical-coordinate points
  never scatter.
- **Clusters** render as larger green circles + a count badge.
- **Individual sightings** render as a small green dot, a name label, and an
  invisible larger **hit layer** for easy clicking.
- **Popups**:
  - single marker → a card with a photo, species/name, and a "see in log" link;
  - cluster → a **carousel** (`source.getClusterLeaves`) that navigates through
    every sighting inside the cluster with prev/next arrows and a
    `current / total` counter.

### Viewport & masking

- The map is centered on Garmisch-Partenkirchen (`47.4917, 11.0922`) and framed
  to a **~15 km box** (bounds derived from a fixed km span converted to
  degrees).
- A GeoJSON **mask** (world polygon with a hole matching the box) is drawn on
  top so everything outside the area is hidden — the viewport always frames the
  region even if a later layer fails.

### Attribution

OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors
