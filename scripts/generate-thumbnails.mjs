import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import mbgl from '@maplibre/maplibre-gl-native'
import sharp from 'sharp'
import { PALETTE, LABEL_TEXT, LABEL_LAYERS, HIDDEN_LAYERS } from '../src/lib/map-palette.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CONTENT = path.join(ROOT, 'src', 'content')
const OUT_DIR = path.join(ROOT, 'src', 'assets', 'thumbnails')
const MANIFEST = path.join(OUT_DIR, 'manifest.json')

const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'
const RADIUS_KM = 1
const MARGIN = 1.45 // view box is this much larger than the region circle

// Logical size + padding replicate the fitBounds that LocationThumbMap used, so
// the framing is identical to the interactive map; `ratio` then supersamples it
// for retina. Changing any of these changes every thumbnail.
const W = 297
const H = 184
const PAD = 12
const RATIO = 3
const OUT_W = W * RATIO
const OUT_H = H * RATIO

const FORCE = process.argv.includes('--force')
// `--soft` downgrades failures to warnings, for the `predev` hook where a
// network hiccup must not stop the dev server from starting.
const SOFT = process.argv.includes('--soft')
const SKIP = process.env.SKIP_THUMBS === '1'

/** Recursively collect every content-collection `index.json` under `dir`. */
async function readEntries(dir) {
  const out = []
  const walk = async (d) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.name === 'index.json') out.push(JSON.parse(await fs.readFile(p, 'utf8')))
    }
  }
  try {
    await walk(dir)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  return out
}

const clamp = (n, lo, hi) => Math.max(Math.min(n, hi), lo)
const mercX = (lng) => (lng + 180) / 360
const mercY = (lat) => {
  const s = clamp(Math.sin((lat * Math.PI) / 180), -0.9999, 0.9999)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

/**
 * The zoom `fitBounds(bounds, { padding: PAD, maxZoom: 16 })` would have picked
 * on a WxH canvas. Mercator Y decreases northward, so the span is an absolute.
 */
function fitZoom(lat, lng) {
  const radiusM = RADIUS_KM * 1000
  const half = radiusM * MARGIN
  const dLat = half / 111320
  const dLon = half / (111320 * Math.cos((lat * Math.PI) / 180))
  const spanX = mercX(lng + dLon) - mercX(lng - dLon)
  const spanY = Math.abs(mercY(lat + dLat) - mercY(lat - dLat))
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY) / 512
  return Math.min(Math.log2(scale), 16)
}

/** Circle outline in GeoJSON, matching the old component's ring maths. */
function circleRing(lat, lng, radiusM, segments = 96) {
  const dLat = radiusM / 110574
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180))
  const ring = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI
    ring.push([lng + dLon * Math.sin(a), lat + dLat * Math.cos(a)])
  }
  ring.push(ring[0])
  return ring
}

const featureCollection = (features) => ({ type: 'FeatureCollection', features })

/** Base style + shared palette + this location's region circle and sighting dots. */
function buildStyle(base, { lat, lng, points }) {
  const style = structuredClone(base)
  const byId = new Map(style.layers.map((l) => [l.id, l]))
  const mergePaint = (id, paint) => {
    const layer = byId.get(id)
    if (layer) layer.paint = { ...(layer.paint || {}), ...paint }
  }

  for (const [id, paint] of Object.entries(PALETTE)) mergePaint(id, paint)
  for (const id of LABEL_LAYERS) mergePaint(id, LABEL_TEXT)
  for (const id of HIDDEN_LAYERS) {
    const layer = byId.get(id)
    if (layer) layer.layout = { ...(layer.layout || {}), visibility: 'none' }
  }

  const radiusM = RADIUS_KM * 1000
  style.sources['thumb-region'] = {
    type: 'geojson',
    data: featureCollection([
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [circleRing(lat, lng, radiusM)] },
      },
    ]),
  }
  style.sources['thumb-sightings'] = {
    type: 'geojson',
    data: featureCollection(
      points.map((p) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    ),
  }
  style.layers.push(
    {
      id: 'thumb-region-fill',
      type: 'fill',
      source: 'thumb-region',
      paint: { 'fill-color': '#33ff33', 'fill-opacity': 0.12 },
    },
    {
      id: 'thumb-region-line',
      type: 'line',
      source: 'thumb-region',
      paint: {
        'line-color': '#33ff33',
        'line-width': 1.5,
        'line-opacity': 0.9,
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'thumb-sighting-dot',
      type: 'circle',
      source: 'thumb-sightings',
      paint: {
        'circle-color': '#33ff33',
        'circle-radius': 4,
        'circle-stroke-color': '#0e120b',
        'circle-stroke-width': 1,
      },
    },
  )
  return style
}

/** mbgl pulls style/tiles/glyphs/sprites through this callback. */
const request = (req, callback) => {
  fetch(req.url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${req.url}`)
      callback(null, { data: new Uint8Array(await res.arrayBuffer()) })
    })
    .catch((err) => callback(err))
}

function render(style, zoom, center) {
  const map = new mbgl.Map({ request, ratio: RATIO })
  map.load(style)
  return new Promise((resolve, reject) => {
    map.render({ zoom, width: W, height: H, center }, (err, buffer) => {
      if (err) return reject(err)
      map.release()
      resolve(buffer)
    })
  })
}

async function main() {
  if (SKIP) {
    console.log('[thumbnails] SKIP_THUMBS=1 — leaving existing images untouched')
    return
  }

  // The slug is the directory name, which readEntries() discards.
  const locationDirs = await fs.readdir(path.join(CONTENT, 'locations'), { withFileTypes: true })
  const locations = []
  for (const entry of locationDirs) {
    const file = path.join(CONTENT, 'locations', entry.name, 'index.json')
    try {
      locations.push({ slug: entry.name, ...JSON.parse(await fs.readFile(file, 'utf8')) })
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  const sightings = await readEntries(path.join(CONTENT, 'sightings'))
  const pointsByLocation = new Map()
  for (const s of sightings) {
    if (!s.locationSlug || !s.location) continue
    if (!pointsByLocation.has(s.locationSlug)) pointsByLocation.set(s.locationSlug, [])
    pointsByLocation.get(s.locationSlug).push(s.location)
  }

  const targets = locations.filter((l) => l.center)
  if (!targets.length) throw new Error('no locations with a center — nothing to render')

  await fs.mkdir(OUT_DIR, { recursive: true })
  let base
  try {
    base = await (await fetch(STYLE_URL)).json()
  } catch (err) {
    if (!SOFT) throw err
    console.warn(`[thumbnails] could not fetch ${STYLE_URL}: ${err?.message || err}`)
    return
  }
  let manifest = {}
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const next = {}
  const failures = []
  let rendered = 0
  let cached = 0

  for (const loc of targets) {
    const { slug, center } = loc
    const points = (pointsByLocation.get(slug) || []).sort((a, b) => a.lat - b.lat || a.lng - b.lng)
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          style: base,
          center,
          points,
          radiusKm: RADIUS_KM,
          margin: MARGIN,
          size: [W, H, PAD, RATIO],
        }),
      )
      .digest('hex')
    next[slug] = hash

    const file = path.join(OUT_DIR, `${slug}.webp`)
    if (!FORCE && manifest[slug] === hash) {
      try {
        await fs.access(file)
        cached++
        continue
      } catch {
        // manifest hit but the image is gone — fall through and re-render
      }
    }

    const zoom = fitZoom(center.lat, center.lng)
    try {
      const buffer = await render(buildStyle(base, { ...center, points }), zoom, [
        center.lng,
        center.lat,
      ])
      await sharp(Buffer.from(buffer), {
        raw: { width: OUT_W, height: OUT_H, channels: 4 },
      })
        .webp({ quality: 82 })
        .toFile(file)
      rendered++
    } catch (err) {
      failures.push(`${slug}: ${err?.message || err}`)
      continue
    }
  }

  // Drop images for locations that no longer exist.
  for (const slug of Object.keys(manifest)) {
    if (!(slug in next)) await fs.rm(path.join(OUT_DIR, `${slug}.webp`), { force: true })
  }
  await fs.writeFile(MANIFEST, JSON.stringify(next, null, 2) + '\n')

  console.log(
    `[thumbnails] ${rendered} rendered, ${cached} cached, ${failures.length} failed ` +
      `(${targets.length} locations)`,
  )
  if (failures.length) {
    for (const f of failures) console.error(`[thumbnails]   ${f}`)
    const msg = `${failures.length} location thumbnails failed to render`
    if (!SOFT) throw new Error(msg)
    console.warn(`[thumbnails] ${msg} (continuing, --soft)`)
  }
}

await main()
