// Bakes each of the nine site themes into one self-contained MapLibre style
// JSON under public/map-themes/{theme}.json. Output is a COMMITTED snapshot
// (regenerate on demand / when the upstream fiord style changes) — deliberately
// not wired into prebuild/predev, so the build keeps its single network fetch
// (the thumbnail tiles) and a style change cannot break a build.
//
// Each JSON is the OpenFreeMap `fiord` style with:
//   - the theme's base palette merged into the existing layer specs,
//   - its label treatment merged into the label layers,
//   - HIDDEN_LAYERS set to `visibility: none`, and
//   - the theme's overlay paint table carried as `metadata.mycoOverlays`, so
//     the site's runtime-added layers (masks, markers, clusters, hiking) read
//     their colours from the same JSON instead of a post-load mutation pass.
// The live maps load the JSON by URL and switch themes with `map.setStyle()`.
//
// Run: npm run update-map-themes    (--force to refetch the base style)
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  BASE_PALETTES,
  LABEL_RECORDS,
  OVERLAY_RECORDS,
  HIDDEN_LAYERS,
  THEME_NAMES,
} from '../src/lib/map-palette.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'map-themes')
const CACHE = path.join(ROOT, '.cache', 'map-themes', 'fiord.json')

const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'
const FORCE = process.argv.includes('--force')

async function baseStyle() {
  if (!FORCE) {
    try {
      return JSON.parse(await fs.readFile(CACHE, 'utf8'))
    } catch {
      // cache miss — fetch below
    }
  }
  let res
  try {
    res = await fetch(STYLE_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    throw new Error(`could not fetch ${STYLE_URL}: ${err?.message || err}`)
  }
  const style = await res.json()
  await fs.mkdir(path.dirname(CACHE), { recursive: true })
  await fs.writeFile(CACHE, JSON.stringify(style))
  console.log(`[map-themes] base style fetched from ${STYLE_URL}`)
  return style
}

function bake(base, theme) {
  const style = structuredClone(base)
  const byId = new Map(style.layers.map((l) => [l.id, l]))
  const mergePaint = (id, paint) => {
    const layer = byId.get(id)
    if (layer) layer.paint = { ...(layer.paint || {}), ...paint }
  }

  for (const [id, paint] of Object.entries(BASE_PALETTES[theme])) mergePaint(id, paint)
  const labels = LABEL_RECORDS[theme]
  for (const id of labels.layers) mergePaint(id, labels.text)
  for (const id of HIDDEN_LAYERS) {
    const layer = byId.get(id)
    if (layer) layer.layout = { ...(layer.layout || {}), visibility: 'none' }
  }

  style.metadata = {
    ...(style.metadata || {}),
    mycoTheme: theme,
    mycoOverlays: OVERLAY_RECORDS[theme],
  }
  return style
}

const base = await baseStyle()
await fs.mkdir(OUT_DIR, { recursive: true })

let written = 0
let skipped = 0
for (const theme of THEME_NAMES) {
  const file = path.join(OUT_DIR, `${theme}.json`)
  const body = JSON.stringify(bake(base, theme), null, 2) + '\n'
  let prev = null
  try {
    prev = await fs.readFile(file, 'utf8')
  } catch {}
  if (prev === body) {
    skipped++
    continue
  }
  await fs.writeFile(file, body)
  written++
}

console.log(`[map-themes] ${THEME_NAMES.length} themes: ${written} written, ${skipped} unchanged`)
