# myco.log

A bilingual (EN/DE) static site for recording and identifying mushroom sightings
around Garmisch-Partenkirchen in the Bavarian Alps. Built with **Astro**.

## Highlights

- **Static content collections** for species, sightings, and an identification backlog.
- **Interactive vector map** (`MapLibre`) showing every sighting with clustered,
  carousel popups, plus on-the-fly elevation contours and hiking overlays.
- **Dev-only identification workflow**: import unknown photos into the backlog and
  promote each item to a full sighting (species + location + notes) via a small
  local Express API.

---

## Project Structure

```text
/
├── public/
│   └── images/                      # Drop source photos here (HEIC/JPG) to add to the backlog
├── scripts/
│   ├── api.mjs                      # Dev-only identify API (http://localhost:4322)
│   └── import-backlog-public.mjs    # Converts public/images → backlog items
├── src/
│   ├── content/
│   │   ├── backlog/{NN}/            # Unidentified items (dateSpotted + images)
│   │   ├── sightings/{DATE}/{slug}/ # Per-observation data + photos
│   │   └── species/{slug}/          # Shared species reference data
│   ├── components/
│   │   ├── LocationPicker.astro     # Click-to-pin map for the identify form
│   │   ├── MapVector.astro          # The sightings map
│   │   └── MushroomCard.astro       # Species summary card
│   ├── layouts/
│   │   └── Layout.astro             # Shared page shell / navigation
│   ├── lib/
│   │   └── sightings.ts             # Enriches sightings with species data
│   ├── i18n/
│   │   ├── en.ts / de.ts            # EN & DE strings
│   │   ├── index.ts                 # Locale helpers (getTranslations, formatDate)
│   │   └── helpers.ts               # l10n() localized-string picker
│   ├── pages/
│   │   ├── index.astro              # Root → redirects to /{default-locale}
│   │   └── [locale]/
│   │       ├── index.astro          # Home
│   │       ├── map.astro            # Map page
│   │       ├── log.astro            # Day index
│   │       ├── log/[date].astro     # A single day's sightings
│   │       ├── mushrooms/index.astro# Species index
│   │       ├── mushrooms/[name].astro# Species page (all sightings + photos)
│   │       ├── backlog.astro        # Chronological backlog list
│   │       └── backlog/[slug].astro # DEV-only identify form
│   └── content.config.ts            # Content-collection schemas (see below)
├── astro.config.mjs                 # i18n routing + dev proxy → api.mjs
└── package.json
```

### Key commands

| Command                  | Action                                          |
| :----------------------- | :---------------------------------------------- |
| `npm install`            | Install dependencies                            |
| `npm run dev`            | Start dev server at `http://localhost:4321`     |
| `npm run build`          | Build the static site into `./dist/`            |
| `npm run preview`        | Preview the production build                    |
| `npm run update-backlog` | Import `public/images/*` into the backlog       |
| `node scripts/api.mjs`   | Start the identify API (`:4322`; dev workflows) |

Dev server + identify API are managed with background mode:

```
astro dev --background
astro dev stop | status | logs
node scripts/api.mjs        # runs the API in the foreground
```

---

## Content Collections

`src/content.config.ts` defines three collections. All text that must render in
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
}
```

### `sightings` — per-observation data

Location: `src/content/sightings/{DATE}/{species-slug}/index.json`

```jsonc
{
  "species": "schizophyllum-commune", // references a species slug
  "dateSpotted": "2026-08-22", // YYYY-MM-DD
  "location": {
    "lat": 47.483453,
    "lng": 11.149244,
    "name": { "en": "Kankerbach", "de": "Kankerbach" }, // optional, localized
  },
  "images": ["./images/IMG_4163.jpg", "./images/IMG_4164.jpg"], // relative to this folder
  "notes": { "en": "…", "de": "…" }, // optional
}
```

The images live in `…/{DATE}/{slug}/images/` next to `index.json`.

### `backlog` — unidentified items awaiting identification

Location: `src/content/backlog/{NN}/index.json` (numeric slug, e.g. `01`, `30`)

```jsonc
{
  "dateSpotted": "2026-08-22", // YYYY-MM-DD (taken from the photo's EXIF date)
  "images": ["./images/01.jpg", "./images/02.jpg"], // converted to JPG
}
```

Only `dateSpotted` + images; species/location are filled in when the item is
promoted to a sighting.

---

## Adding items to the backlog

Two ways:

### 1. Manual

Create a numeric folder under `src/content/backlog/`, e.g. `31`, with an
`index.json` and converted JPGs in `images/`:

```
src/content/backlog/31/
├── index.json        # { "dateSpotted": "2026-08-22", "images": ["./images/01.jpg", …] }
└── images/
    ├── 01.jpg
    └── 02.jpg
```

### 2. Automatic (`npm run update-backlog`)

1. Drop **HEIC or JPG** photos into a new subfolder under `public/images/`,
   e.g. `public/images/my-new-find/`.
2. Run `npm run update-backlog`.

`scripts/import-backlog-public.mjs` then, for every subfolder:

- picks the **next free numeric id** (highest existing backlog folder + 1),
- **derives `dateSpotted` from the photo's EXIF** capture date (via `mdls`),
- **converts the HEIC photos to JPG** (`sips`) as `images/01.jpg…NN.jpg`,
- writes the item's `index.json`.

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

`astro config.mjs` proxies `/myco/api` → `http://localhost:4322`
(`vite.server.proxy`), so the form submits through the dev server.

### Identify an item

1. Open `/{locale}/backlog` (the chronological list of unidentified items).
2. Click **identify** on an item → the identify form:
   - **Date** — pre-filled from the photo's `dateSpotted` (editable).
   - **Species** — pick an existing one, or add a new species (scientific +
     common names EN/DE), which creates a `species` entry on submit.
   - **Location** — choose a known location name or type a new one, and
     **click the map** to drop a pin (writes `lat`/`lng` to a hidden input).
   - **Notes** — optional EN + DE notes.
3. Submit → the API (`scripts/api.mjs:POST /api/sightings`):
   - creates the sighting under `src/content/sightings/{date}/{slug}/`,
   - **moves the item's images** into it (renamed `{speciesSlug}{n}.jpg`),
   - optionally creates the new `species`,
   - **removes the backlog item**, and
   - redirects you back to the backlog overview.

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
