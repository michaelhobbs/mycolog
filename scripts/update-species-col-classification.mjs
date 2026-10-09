#!/usr/bin/env node
// Fetch each species' higher-rank classification (phylum -> genus) from the
// published Catalogue of Life release via ChecklistBank, and emit typed TS
// modules under src/data/col/species. This snapshot is the site's source of
// truth for classification: Wikidata's `parent taxon` chain is deliberately
// not used. Snapshots are committed, never fetched at build time.
import { promises as fs, existsSync, readdirSync } from 'fs'
import path from 'path'
import { format } from 'prettier'
import { ROOT, getTaxonInfo, matchNameUsage, sleep } from './lib/col.mjs'
import {
  COL_CLASSIFICATION_DATASET_KEY,
  COL_CLASSIFICATION_RELEASE,
  DEFAULT_COL_DATASET_KEY,
} from './config/col.mjs'

const SPECIES_DIR = path.join(ROOT, 'src', 'content', 'species')
const WD_SPECIES_DIR = path.join(ROOT, 'src', 'data', 'wikidata', 'species')
const TAXONOMY_SPECIES_DIR = path.join(ROOT, 'src', 'data', 'taxonomy', 'species')
const OUT_DIR = path.join(ROOT, 'src', 'data', 'col', 'species')
const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry-run')
const DATASET_KEY = COL_CLASSIFICATION_DATASET_KEY
const RELEASE = COL_CLASSIFICATION_RELEASE
// The fallback source is the Index Fungorum crawl, a different ChecklistBank
// dataset from the published COL release. There is no release name for it, so a
// row read from it is labelled by the source itself.
const IF_DATASET_KEY = DEFAULT_COL_DATASET_KEY
const IF_RELEASE = 'Index Fungorum'

const RANKS = ['phylum', 'class', 'order', 'family', 'genus']
const j = JSON.stringify
const PRETTIER = { parser: 'typescript', semi: false, singleQuote: true, printWidth: 100 }

// Wikidata's Catalogue of Life identifier (P10585), read textually rather than
// imported: the barrel's extensionless relative imports are not resolvable by
// Node's ESM loader. Keyed by Wikidata QID.
async function loadColIds() {
  const colIds = new Map()
  if (!existsSync(WD_SPECIES_DIR)) return colIds
  for (const file of readdirSync(WD_SPECIES_DIR)) {
    const m = file.match(/^(Q\d+)\.ts$/)
    if (!m) continue
    const src = await fs.readFile(path.join(WD_SPECIES_DIR, file), 'utf8')
    const ids = [...src.matchAll(/pid: 'P10585',[\s\S]{0,200}?value: '([^']+)'/g)].map((x) => x[1])
    if (ids.length) colIds.set(m[1], ids)
  }
  return colIds
}

function scientificNameOf(usage) {
  const n = usage?.name && typeof usage.name === 'object' ? usage.name : null
  return n?.scientificName ?? usage?.scientificName
}

// The accepted Index Fungorum usage id from each species' taxonomy snapshot,
// read textually (same reason as P10585: the barrel's extensionless imports are
// not resolvable by Node's ESM loader). Keyed by collection slug. This is the
// fallback join for a species the COL release does not hold under our name, and
// it keeps the classification consistent with the Nomenclature block on the page.
async function loadIfUsageIds() {
  const ids = new Map()
  if (!existsSync(TAXONOMY_SPECIES_DIR)) return ids
  for (const file of readdirSync(TAXONOMY_SPECIES_DIR)) {
    const m = file.match(/^(.+)\.ts$/)
    if (!m || file === 'index.ts') continue
    const src = await fs.readFile(path.join(TAXONOMY_SPECIES_DIR, file), 'utf8')
    const id = src.match(/colUsageId: '(\d+)'/)?.[1]
    if (id) ids.set(m[1], id)
  }
  return ids
}

// A name match is only usable for a species if it landed on a species-rank
// taxon; COL's match endpoint otherwise falls back to the genus, which would
// silently store a classification that has no genus of its own.
const SPECIES_RANK =
  /^(species|subspecies|variety|subvariety|forma|form|nothospecies|nothosubspecies|hybrid)$/

function extractRanks(info) {
  const out = {}
  for (const x of info.classification || []) {
    if (RANKS.includes(x.rank)) out[x.rank] = { id: String(x.id), name: x.name }
  }
  return out
}

// Resolve a species to a Catalogue of Life usage, preferring Wikidata's COL id
// and falling back to a name match. When COL holds no species-rank usage under
// our name, fall back to the species' Index Fungorum usage (its accepted usage
// from the taxonomy snapshot) so a real species is not left as a bare gap.
// `null` means the species is absent from both (stored as an honest gap, never
// guessed).
async function resolveByIndexFungorum(ifUsageId, log, slug) {
  if (!ifUsageId) return null
  const info = await getTaxonInfo(IF_DATASET_KEY, ifUsageId, { log })
  if (!info) return null
  const rank = String(info.usage?.name?.rank ?? '').toLowerCase()
  if (!SPECIES_RANK.test(rank)) {
    log(
      `[if] ${slug}: Index Fungorum usage ${ifUsageId} is ${rank || 'unknown'} rank, ` +
        `not a species -- skipped`,
    )
    return null
  }
  return { info, matchedBy: 'index-fungorum', datasetKey: IF_DATASET_KEY, release: IF_RELEASE }
}

async function resolveSpecies({ colIds, scientificName, ifUsageId }, log, slug) {
  for (const id of colIds) {
    const info = await getTaxonInfo(DATASET_KEY, id, { log })
    if (info)
      return { info, matchedBy: 'wikidata-p10585', datasetKey: DATASET_KEY, release: RELEASE }
  }

  const matched = await matchNameUsage(DATASET_KEY, scientificName, { log })
  if (matched) {
    const accepted =
      matched.accepted && typeof matched.accepted === 'object' ? matched.accepted : matched
    const rank = String(accepted.rank ?? matched.rank ?? '').toLowerCase()
    if (SPECIES_RANK.test(rank)) {
      const info = await getTaxonInfo(DATASET_KEY, accepted.id, { log })
      if (info) return { info, matchedBy: 'name-search', datasetKey: DATASET_KEY, release: RELEASE }
    } else {
      log(
        `[col] ${slug}: "${scientificName}" matched "${scientificNameOf(matched) ?? matched.name}" ` +
          `at ${rank || 'unknown'} rank, not a species -- trying Index Fungorum`,
      )
    }
  } else {
    log(`[col] ${slug}: "${scientificName}" not matched in COL`)
  }

  return resolveByIndexFungorum(ifUsageId, log, slug)
}

function renderTs(slug, data) {
  return [
    `// Catalogue of Life classification for ${slug}`,
    '// Generated by scripts/update-species-col-classification.mjs -- do not edit by hand.',
    "import type { ColClassification } from '../types'",
    '',
    'export const classification: ColClassification = {',
    `  slug: ${j(data.slug)},`,
    `  colDatasetKey: ${j(data.colDatasetKey)},`,
    `  colRelease: ${j(data.colRelease)},`,
    `  colId: ${j(data.colId)},`,
    `  acceptedName: ${j(data.acceptedName)},`,
    `  status: ${j(data.status)},`,
    `  matchedBy: ${j(data.matchedBy)},`,
    `  classification: ${j(data.classification)},`,
    `  lastUpdated: ${j(data.lastUpdated)},`,
    '}',
    '',
    'export default classification',
    '',
  ].join('\n')
}

function renderIndex(manifest) {
  const sorted = manifest.slice().sort((a, b) => a.slug.localeCompare(b.slug))
  const imports = sorted.map(
    (m) =>
      `import { classification as ${m.slug.replace(/-/g, '_')}Classification } from './${m.slug}'`,
  )
  const entries = sorted.map((m) => `  '${m.slug}': ${m.slug.replace(/-/g, '_')}Classification,`)
  return [
    '// Generated by scripts/update-species-col-classification.mjs -- do not edit by hand.',
    "export type * from '../types'",
    '',
    ...imports,
    '',
    'export const speciesClassification: Record<string, import("../types").ColClassification> = {',
    ...entries,
    '}',
    '',
  ].join('\n')
}

async function main() {
  const log = console.log
  if (!DATASET_KEY) throw new Error('No Catalogue of Life dataset key configured')
  await fs.mkdir(OUT_DIR, { recursive: true })
  log(`[col] using dataset ${DATASET_KEY} (${RELEASE})`)

  const colIds = await loadColIds()
  const ifUsageIds = await loadIfUsageIds()

  const species = []
  for (const slug of readdirSync(SPECIES_DIR).sort()) {
    const file = path.join(SPECIES_DIR, slug, 'index.json')
    if (!existsSync(file)) continue
    const doc = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!doc.scientificName) continue
    species.push({
      slug,
      scientificName: doc.scientificName,
      wikidataId: doc.wikidataId,
    })
  }
  log(`[col] processing ${species.length} species`)

  const manifest = []
  const skipped = []
  const matched = { 'wikidata-p10585': 0, 'name-search': 0, 'index-fungorum': 0 }

  for (let i = 0; i < species.length; i++) {
    const { slug, scientificName, wikidataId } = species[i]
    try {
      const resolved = await resolveSpecies(
        {
          colIds: wikidataId ? colIds.get(wikidataId) || [] : [],
          scientificName,
          ifUsageId: ifUsageIds.get(slug),
        },
        log,
        slug,
      )
      if (!resolved) {
        skipped.push(slug)
        log(`[col] ${i + 1}/${species.length} ${slug}: not found in COL or Index Fungorum, skipped`)
        await sleep(150)
        continue
      }
      const { info, matchedBy, datasetKey, release } = resolved
      const usage = info.usage
      const acceptedName = scientificNameOf(usage)
      if (usage.status && usage.status !== 'accepted') {
        log(`[col] ${slug}: resolved usage status is "${usage.status}" -- manual review needed`)
      }
      const data = {
        slug,
        colDatasetKey: datasetKey,
        colRelease: release,
        colId: String(usage.id),
        acceptedName,
        status: usage.status ?? 'unknown',
        matchedBy,
        classification: extractRanks(info),
        lastUpdated: new Date().toISOString().slice(0, 10),
      }
      matched[matchedBy] += 1

      const ts = await format(renderTs(slug, data), PRETTIER)
      const outFile = path.join(OUT_DIR, `${slug}.ts`)
      if (FORCE || !existsSync(outFile) || (await fs.readFile(outFile, 'utf8')) !== ts) {
        if (!DRY) await fs.writeFile(outFile, ts)
      }
      manifest.push({ slug })
      const ranks = RANKS.filter((r) => data.classification[r]).length
      log(
        `[col] ${i + 1}/${species.length} ${slug}: ${acceptedName} ` +
          `(${matchedBy}) ${ranks}/${RANKS.length} ranks`,
      )
    } catch (e) {
      log(`[col] ${i + 1}/${species.length} ${slug}: error: ${e.message}`)
      skipped.push(slug)
    }
    if (i < species.length - 1) await sleep(120)
  }

  const idx = await format(renderIndex(manifest), PRETTIER)
  if (!DRY) await fs.writeFile(path.join(OUT_DIR, 'index.ts'), idx)

  // Prune modules for species that no longer exist in the content collection.
  const live = new Set(manifest.map((m) => `${m.slug}.ts`))
  for (const file of readdirSync(OUT_DIR)) {
    if (!file.endsWith('.ts') || file === 'index.ts') continue
    if (!live.has(file)) {
      log(`[col] pruning stale ${file}`)
      if (!DRY) await fs.unlink(path.join(OUT_DIR, file))
    }
  }

  log(`[col] wrote ${manifest.length} classification files, skipped ${skipped.length}`)
  log(
    `[col] matched: ${matched['wikidata-p10585']} via P10585, ` +
      `${matched['name-search']} via search, ${matched['index-fungorum']} via Index Fungorum`,
  )
  if (skipped.length) log(`[col] skipped: ${skipped.join(', ')}`)
  if (DRY) log('[col] dry run: no files written')
}

main().catch((err) => {
  console.error('[col] failed:', err)
  process.exit(1)
})
