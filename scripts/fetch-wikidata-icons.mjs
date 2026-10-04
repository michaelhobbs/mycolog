#!/usr/bin/env node
// Download the icon for every value of the Wikidata mushroom properties in
// src/data/wikidata/morphology-types.ts.
//
// The icons are authored on Wikimedia Commons and attached to each value item
// with `icon (P2910)`, which exists precisely for this purpose.
//
// `image (P18)` is deliberately NOT used as a fallback. On these value items
// P18 is whatever photograph or clipart happens to illustrate the article --
// "nematophagous fungus" falls back to a field photo of Harposporium on a dead
// nematode, "edible when cooked" to a photo of a plate of fried mushrooms,
// "edible mushroom" to a cooking icon. Those are not morphology glyphs, so a
// value without P2910 is recorded as missing instead.
//
// Writes the files to src/data/wikidata/icons/<property>/<value>.<ext> and a
// generated src/data/wikidata/icons.ts mapping QID -> local file + provenance
// (Commons URL, licence, author). The generated .ts is what the site imports;
// never hand-edit it.
//
// Usage:
//   node scripts/fetch-wikidata-icons.mjs            # fetch missing files
//   node scripts/fetch-wikidata-icons.mjs --force    # re-fetch everything
//
// Requires network access to query.wikidata.org and commons.wikimedia.org.
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { format } from 'prettier'
import {
  HymeniumType,
  MushroomCapShape,
  HymeniumAttachment,
  StipeCharacter,
  SporePrintColor,
  MushroomEcologicalType,
  Edibility,
  WikidataMushroomProperties,
} from '../src/data/wikidata/morphology-types.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'src', 'data', 'wikidata')
const ICON_DIR = path.join(DATA_DIR, 'icons')
const ICON_INDEX = path.join(DATA_DIR, 'icons.ts')

const SPARQL_URL = 'https://query.wikidata.org/sparql'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const USER_AGENT =
  'mushrooms-astro-site/1.0 (Wikidata icon fetcher; https://github.com/) node-fetch'

const FORCE = process.argv.includes('--force')
const BATCH = 20 // Commons allows 50 titles per query; stay well under it.
// commons.wikimedia.org answers 429 readily from a shared IP, so pace requests
// and back off hard rather than hammering it.
const THROTTLE_MS = 1500
const MAX_TRIES = 6

// The properties whose values are drawn as structure icons. Spore print colour
// (P787) is here too, and was not always: Wikidata gained `icon (P2910)` drawings
// for 9 of its 22 values (yellow, pink, olive, buff, purple, blackish-brown,
// olive-brown, pinkish-brown, purple-black), so the group is no longer empty. The
// other 13 still have none and are reported as missing rather than substituted --
// a colour with no glyph stays a word, and `image (P18)` is never a fallback
// (see REVIEW above for why).
const GROUPS = [
  { prop: 'hymeniumType', pid: WikidataMushroomProperties.HymeniumType, values: HymeniumType },
  {
    prop: 'mushroomCapShape',
    pid: WikidataMushroomProperties.MushroomCapShape,
    values: MushroomCapShape,
  },
  {
    prop: 'hymeniumAttachment',
    pid: WikidataMushroomProperties.HymeniumAttachment,
    values: HymeniumAttachment,
  },
  {
    prop: 'stipeCharacter',
    pid: WikidataMushroomProperties.StipeCharacter,
    values: StipeCharacter,
  },
  {
    prop: 'sporePrintColor',
    pid: WikidataMushroomProperties.SporePrintColor,
    values: SporePrintColor,
  },
  {
    prop: 'mushroomEcologicalType',
    pid: WikidataMushroomProperties.MushroomEcologicalType,
    values: MushroomEcologicalType,
  },
  { prop: 'edibility', pid: WikidataMushroomProperties.Edibility, values: Edibility },
]

// Values where Wikidata's own data is wrong, so nothing is downloaded and a
// human decides. Recorded in the generated .ts.
const REVIEW = {
  // No P2910. Its P18 is "Convex cap icon.svg", which is the icon for Q14544535,
  // a different cap shape -- so the only available file is a wrong fact.
  [MushroomCapShape.SemiSpherical]: "no icon; P18 is another value's icon (convex cap)",
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** fetch with retry/backoff, since the Commons API answers 429 under load. */
async function fetchRetry(url, tries = MAX_TRIES) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (res.ok) return res
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      // Respect Retry-After when present, else exponential backoff capped at 30s.
      const hinted = Number(res.headers.get('retry-after'))
      const wait = Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 : 0
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 30_000)
      const pause = wait || backoff
      console.log(`[icons] ${res.status}, retrying in ${Math.round(pause / 1000)}s`)
      await sleep(pause)
      continue
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`)
  }
}

/** Wikidata stores a bare 6-digit uppercase triplet (FFFF00); CSS needs the `#`. */
function normalizeHex(raw, qid) {
  const v = String(raw).trim().replace(/^#/, '').toUpperCase()
  if (/^[0-9A-F]{6}$/.test(v)) return '#' + v
  console.log(`[icons] ${qid} has an unusable sRGB triplet ${JSON.stringify(raw)} — ignored`)
  return null
}

/** SPARQL: English label, icon (P2910) and sRGB triplets (P465) for a set of QIDs. */
async function queryIcons(qids) {
  const sparql = `SELECT ?item ?itemLabel ?icon ?hex WHERE {
  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?item wdt:P2910 ?icon }
  OPTIONAL { ?item wdt:P465 ?hex }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`
  const res = await fetchRetry(`${SPARQL_URL}?format=json&query=${encodeURIComponent(sparql)}`, 3)
  if (!(res.headers.get('content-type') || '').includes('json')) {
    throw new Error(`SPARQL returned ${res.headers.get('content-type')}`)
  }
  const json = await res.json()
  const rows = new Map()
  // SPARQL gives URIs; the filename is the last, percent-encoded segment.
  const fileOf = (uri) => decodeURIComponent(uri.split('/').pop())
  for (const b of json.results.bindings) {
    const qid = b.item.value.split('/').pop()
    let row = rows.get(qid)
    if (!row) rows.set(qid, (row = { label: b.itemLabel?.value ?? '', icon: null, colors: [] }))
    // Both OPTIONALs multiply rows, so accumulate rather than overwrite.
    if (b.icon && !row.icon) row.icon = fileOf(b.icon.value)
    const hex = b.hex && normalizeHex(b.hex.value, qid)
    if (hex && !row.colors.includes(hex)) row.colors.push(hex)
  }
  // No statement carries a rank we can lean on (several values are all `normal`),
  // so the order is ours to fix: sorted, which makes a re-run a no-op diff.
  for (const row of rows.values()) row.colors.sort()
  return rows
}

/** Commons metadata for many files at once: direct URL, licence, author. */
async function commonsInfo(fileNames) {
  const out = new Map()
  for (let i = 0; i < fileNames.length; i += BATCH) {
    const chunk = fileNames.slice(i, i + BATCH)
    const url =
      `${COMMONS_API}?action=query&format=json&prop=imageinfo` +
      `&iiprop=url|mime|extmetadata&titles=` +
      encodeURIComponent(chunk.map((f) => `File:${f}`).join('|'))
    const res = await fetchRetry(url)
    const json = await res.json()
    const strip = (s) => (s ? decodeHtml(s).trim() : null)
    for (const page of Object.values(json.query?.pages ?? {})) {
      if (page.missing !== undefined) continue
      const info = page.imageinfo?.[0]
      if (!info) continue
      const meta = info.extmetadata ?? {}
      out.set(page.title.replace(/^File:/, ''), {
        url: info.descriptionurl,
        directUrl: info.url,
        mime: info.mime,
        license: strip(meta.LicenseShortName?.value),
        author: strip(meta.Artist?.value),
      })
    }
    await sleep(THROTTLE_MS)
  }
  return out
}

const decodeHtml = (s) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Commons stores multi-line Artist fields with literal "\n" escapes.
    .replace(/\\n/g, ', ')

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const targets = GROUPS.flatMap((g) =>
    Object.entries(g.values).map(([key, qid]) => ({ group: g, key, qid })),
  )

  console.log(`[icons] querying Wikidata for ${new Set(targets.map((t) => t.qid)).size} values`)
  const rows = await queryIcons([...new Set(targets.map((t) => t.qid))])

  // Resolve every wanted file name first, then look the metadata up in bulk.
  const wanted = []
  const missing = []
  const review = []

  for (const { group, key, qid } of targets) {
    if (REVIEW[qid]) {
      review.push({ prop: group.prop, key, qid, reason: REVIEW[qid] })
      continue
    }
    const row = rows.get(qid)
    const fileName = row?.icon ?? null
    if (!fileName) {
      missing.push({ prop: group.prop, key, qid })
      continue
    }
    wanted.push({ group, key, qid, fileName })
  }

  // Colour is recorded for every value that has one, icon or not — a swatch is
  // the only representation 13 of the 22 spore print colours can ever have.
  const colors = targets
    .map(({ group, key, qid }) => ({
      prop: group.prop,
      key,
      qid,
      colors: rows.get(qid)?.colors ?? [],
    }))
    .filter((c) => c.colors.length > 0)

  console.log(`[icons] fetching Commons metadata for ${wanted.length} files`)
  const info = await commonsInfo([...new Set(wanted.map((w) => w.fileName))])

  const entries = []
  let downloaded = 0
  let reused = 0

  for (const { group, key, qid, fileName } of wanted) {
    const meta = info.get(fileName)
    if (!meta) {
      missing.push({ prop: group.prop, key, qid, fileName })
      continue
    }
    const ext = path.extname(fileName).replace('.', '').toLowerCase() || 'svg'
    const local = path.join(ICON_DIR, group.prop, `${key}.${ext}`)

    if (FORCE || !(await exists(local))) {
      const res = await fetchRetry(meta.directUrl)
      await fs.mkdir(path.dirname(local), { recursive: true })
      await fs.writeFile(local, Buffer.from(await res.arrayBuffer()))
      downloaded++
    } else {
      reused++
    }

    entries.push({
      prop: group.prop,
      pid: group.pid,
      key,
      qid,
      label: rows.get(qid).label,
      file: path.relative(ROOT, local).split(path.sep).join('/'),
      format: meta.mime === 'image/svg+xml' ? 'svg' : ext,
      source: meta.url,
      license: meta.license,
      author: meta.author,
    })
  }

  await writeIndex(entries, missing, review, colors)

  console.log(`[icons] ${downloaded} downloaded, ${reused} already present`)
  if (review.length) {
    console.log(`[icons] ${review.length} held back for review:`)
    for (const r of review) console.log(`         ${r.prop}.${r.key} (${r.qid}) — ${r.reason}`)
  }
  if (missing.length) {
    console.log(`[icons] ${missing.length} have no icon on Wikimedia Commons:`)
    for (const m of missing) console.log(`         ${m.prop}.${m.key} (${m.qid})`)
  }
  const withColor = colors.reduce((n, c) => n + c.colors.length, 0)
  console.log(`[icons] ${colors.length} values carry an sRGB colour (${withColor} triplets)`)
  console.log(`[icons] wrote ${path.relative(ROOT, ICON_INDEX)}`)
}

async function writeIndex(entries, missing, review, colors) {
  const byProp = new Map()
  for (const e of entries) {
    if (!byProp.has(e.prop)) byProp.set(e.prop, [])
    byProp.get(e.prop).push(e)
  }
  const formats = [...new Set(entries.map((e) => e.format))].sort()

  const out = []
  const p = (s = '') => out.push(s)

  p('// Generated by scripts/fetch-wikidata-icons.mjs — do not edit by hand.')
  p('//')
  p('// The drawings are authored on Wikimedia Commons and attached to each Wikidata')
  p('// value item with `icon (P2910)`. Source URL, licence and author are kept per')
  p('// entry because the files are third-party and mostly PD or CC BY-SA.')
  p('//')
  p('// The local copies are the originals, unmodified and byte-identical to')
  p('// Commons, so they can be restyled later without re-downloading.')
  p()
  p(`export type IconFormat = ${formats.map((f) => JSON.stringify(f)).join(' | ')}`)
  p()
  p('export interface WikidataIcon {')
  p('  /** The enum key in src/data/wikidata/morphology-types.ts. */')
  p('  key: string')
  p('  /** Wikidata QID of the value. */')
  p('  qid: string')
  p('  /** English Wikidata label. */')
  p('  label: string')
  p('  /** Path relative to the repo root. */')
  p('  file: string')
  p('  format: IconFormat')
  p('  /** Commons file page — required for attribution. */')
  p('  source: string')
  p('  license: string | null')
  p('  author: string | null')
  p('}')
  p()
  p('export interface WikidataValueColor {')
  p('  prop: string')
  p('  /** The enum key in src/data/wikidata/morphology-types.ts. */')
  p('  key: string')
  p('  qid: string')
  p('  /** CSS sRGB triplets from `sRGB color hex triplet (P465)`, sorted. */')
  p('  colors: string[]')
  p('}')
  p()
  p('export interface MissingIcon {')
  p('  prop: string')
  p('  key: string')
  p('  qid: string')
  p('}')
  p()
  p('export interface ReviewIcon extends MissingIcon {')
  p('  reason: string')
  p('}')
  p()

  for (const [prop, list] of byProp) {
    p(`/** ${list.length} icons for ${prop}. */`)
    p(`export const ${prop}Icons: WikidataIcon[] = [`)
    for (const e of list) {
      p('  {')
      p(`    key: ${JSON.stringify(e.key)},`)
      p(`    qid: ${JSON.stringify(e.qid)},`)
      p(`    label: ${JSON.stringify(e.label)},`)
      p(`    file: ${JSON.stringify(e.file)},`)
      p(`    format: ${JSON.stringify(e.format)},`)
      p(`    source: ${JSON.stringify(e.source)},`)
      p(`    license: ${JSON.stringify(e.license)},`)
      p(`    author: ${JSON.stringify(e.author)},`)
      p('  },')
    }
    p(']')
    p()
  }

  p('/** Every downloaded icon, keyed by QID. */')
  p('export const iconsByQid: Record<string, WikidataIcon> = {')
  for (const [prop, list] of byProp) {
    for (const [i, e] of list.entries()) {
      p(`  ${e.qid}: ${prop}Icons[${i}],`)
    }
  }
  p('}')
  p()
  p('/**')
  p(' * Values carrying an `sRGB color hex triplet (P465)`, icon or not. A value may')
  p(' * have more than one triplet (salmon has two, purple-brown five), so these are')
  p(" * all of Wikidata's answers, sorted, not a single canonical colour.")
  p(' */')
  p('export const valueColors: WikidataValueColor[] = [')
  for (const c of colors) {
    p(
      `  { prop: ${JSON.stringify(c.prop)}, key: ${JSON.stringify(c.key)}, ` +
        `qid: ${JSON.stringify(c.qid)}, colors: ${JSON.stringify(c.colors)} },`,
    )
  }
  p(']')
  p()
  p('/** Every sRGB triplet, keyed by QID. */')
  p('export const colorsByQid: Record<string, string[]> = {')
  for (const c of colors) {
    p(`  ${c.qid}: ${JSON.stringify(c.colors)},`)
  }
  p('}')
  p()
  p('/** Values Wikimedia Commons has no icon for. */')
  p('export const missingIcons: MissingIcon[] = [')
  for (const m of missing) {
    p(
      `  { prop: ${JSON.stringify(m.prop)}, key: ${JSON.stringify(m.key)}, qid: ${JSON.stringify(m.qid)} },`,
    )
  }
  p(']')
  p()
  p('/** Values whose Wikidata icon is wrong, so nothing was downloaded. */')
  p('export const iconsToReview: ReviewIcon[] = [')
  for (const r of review) {
    p(
      `  { prop: ${JSON.stringify(r.prop)}, key: ${JSON.stringify(r.key)}, qid: ${JSON.stringify(r.qid)}, reason: ${JSON.stringify(r.reason)} },`,
    )
  }
  p(']')

  const text = await format(out.join('\n') + '\n', {
    parser: 'typescript',
    semi: false,
    singleQuote: true,
    printWidth: 100,
  })
  await fs.writeFile(ICON_INDEX, text)
}

main().catch((err) => {
  console.error('[icons] failed:', err)
  process.exit(1)
})
