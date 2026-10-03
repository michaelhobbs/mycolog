#!/usr/bin/env node
// Fetch a Wikidata snapshot for every species in src/content/species and emit
// one typed TS module per species under src/data/wikidata/species.
//
// The QIDs come from each index.json's `wikidataId`, as resolved by
// scripts/resolve-species-wikidata.mjs. Nothing is matched by name here: a
// species either has a verified QID or is skipped and reported, because a
// guessed id puts the wrong mushroom on the page.
//
// Output is typed against each property's Wikidata `one-of` constraint
// (../morphology-types). That is only safe because every value that actually
// occurs in this data is already in those enums -- checked across all 47
// species. Keep it that way: if a rebuild reports an unknown value, the fix is
// to add the QID to the enum, never to widen the enum to `string`.
//
// Usage:
//   npm run update-species-wikidata
//   node scripts/fetch-species-wikidata.mjs --force   # rewrite unchanged files
import { promises as fs, existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { format } from 'prettier'
import {
  ROOT,
  entities,
  qidsOf,
  stringsOf,
  valuesOf,
  labelMap,
  formatterUrls,
  formatExternalUrl,
} from './lib/wikidata.mjs'

const SPECIES_DIR = path.join(ROOT, 'src', 'content', 'species')
const OUT_DIR = path.join(ROOT, 'src', 'data', 'wikidata', 'species')
const TYPES_FILE = path.join(OUT_DIR, 'types.ts')
const FORCE = process.argv.includes('--force')

/** Which property each snapshot field is read from. */
const P = {
  taxonName: 'P225',
  taxonRank: 'P105',
  parentTaxon: 'P171',
  instanceOf: 'P31',
  authorCitation: 'P6507',
  shortName: 'P1813',
  basionym: 'P566',
  aliases: 'P1448',
  commonNames: 'P1843',
  hymeniumType: 'P783',
  capShape: 'P784',
  hymeniumAttachment: 'P785',
  stipeCharacter: 'P786',
  sporePrintColor: 'P787',
  ecologicalType: 'P788',
  edibility: 'P789',
  conservationStatus: 'P141',
  images: 'P18',
  commonsCategory: 'P373',
  commonsGallery: 'P935',
}

/**
 * External taxonomies worth keeping, with a human-readable source name.
 *
 * Wikidata carries ~50 external-id properties across these 47 species; most are
 * regional checklists this site has no use for. Only the broadly recognised
 * ones are kept so the emitted modules stay readable.
 */
const EXTERNAL_IDS = {
  P1391: 'Index Fungorum',
  P846: 'GBIF',
  P962: 'MycoBank',
  P3151: 'iNaturalist',
  P838: 'BioLib',
  P830: 'Encyclopedia of Life',
  P685: 'NCBI Taxonomy',
  P10585: 'Catalogue of Life',
}

const LANGS = ['en', 'de']

/** Properties whose values are constrained enums, and the enum they map to. */
const CONSTRAINED = {
  [P.hymeniumType]: 'HymeniumType',
  [P.capShape]: 'MushroomCapShape',
  [P.hymeniumAttachment]: 'HymeniumAttachment',
  [P.stipeCharacter]: 'StipeCharacter',
  [P.sporePrintColor]: 'SporePrintColor',
  [P.ecologicalType]: 'MushroomEcologicalType',
  [P.edibility]: 'Edibility',
}

/**
 * Read the QID sets out of morphology-types.ts.
 *
 * `src.split(/\n\/\/ (P\d+) - /)` keeps the property id in the output array;
 * a plain `/\n\/\/ P\d+/` split consumes the separator, so each block starts at
 * ` - hymenium type` and never matches -- which silently reports every real
 * value as unknown.
 */
let enumCache = null
function readEnums() {
  if (enumCache) return enumCache
  const src = readFileSync(path.join(ROOT, 'src/data/wikidata/morphology-types.ts'), 'utf8')
  const parts = src.split(/\n\/\/ (P\d+) - /)
  const enums = {}
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i + 1].match(/export const (\w+) = \{/)?.[1]
    if (!name) continue
    enums[name] = new Set([...parts[i + 1].matchAll(/'(Q\d+)'/g)].map((m) => m[1]))
  }
  enumCache = enums
  return enums
}

/** `albatrellus-ovinus` + `Q331465` -> `albatrellusOvinusQ331465`. */
function exportName(slug, qid) {
  const camel = slug
    .split('-')
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join('')
  return `${camel}${qid.toUpperCase()}`
}

/** Drop `novalue`/`deprecated` ranks: not real values. */
const live = (c) => c.rank !== 'deprecated' && c.rank !== 'novalue'

/** Item-valued statements for one property, with resolved labels.
 *
 *  Takes the whole entity, not its `claims` map, to match the shape the shared
 *  lib helpers use. Passing `claims` here reads `claims.claims` and silently
 *  yields nothing for every property. */
function refs(entity, pid, labels) {
  return (entity?.claims?.[pid] ?? [])
    .filter(live)
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean)
    .map((qid) => ({ pid, qid, labels: labels.get(qid) ?? {} }))
}

const j = JSON.stringify

function refLiteral(r) {
  return `{ pid: ${j(r.pid)}, qid: ${j(r.qid)}, labels: ${labelsLiteral(r.labels)} }`
}

/** `{ en: '...', de: '...' }`, omitting languages the item has no label for. */
function labelsLiteral(labels) {
  const entries = Object.entries(labels ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${j(v)}`)
  return entries.length ? `{ ${entries.join(', ')} }` : '{}'
}

function refArray(list) {
  return `[${list.map(refLiteral).join(', ')}]`
}

/**
 * A `{ en: ..., de: ... }` literal for the per-language blocks. These cannot go
 * through `object()`, which writes each key verbatim -- and `labels.en` is not
 * valid TypeScript.
 */
function langObject(map) {
  const entries = Object.entries(map).filter(([, v]) => v !== undefined)
  if (!entries.length) return undefined
  return `{ ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')} }`
}

/** An object literal with only the keys that actually have data. */
function object(entries) {
  const body = entries.filter(([, v]) => v !== undefined)
  if (!body.length) return '{}'
  return `{\n${body.map(([k, v]) => `    ${k}: ${v},`).join('\n')}\n  }`
}

/** Monolingual text on a monolingual-text property: `{ lang, value }` pairs. */
function localized(entity, pid) {
  const out = []
  for (const c of entity?.claims?.[pid] ?? []) {
    if (!live(c)) continue
    const v = c.mainsnak?.datavalue?.value
    if (typeof v === 'string') continue
    if (v && typeof v.text === 'string' && typeof v.language === 'string') {
      out.push({ lang: v.language, value: v.text })
    }
  }
  const seen = new Set()
  return out.filter((x) => !seen.has(x.lang + ' ' + x.value) && seen.add(x.lang + ' ' + x.value))
}

/**
 * Emit one species as TS source.
 *
 * A value that is not in its enum is recorded in `unknown` and then omitted,
 * rather than emitted as a bare string. Omitting it makes `astro check` fail
 * loudly on the missing required property, which is the correct outcome: the
 * fix is to add the QID to morphology-types.ts.
 */
function render(slug, scientificName, qid, e, labels, unknown, formatters, unlinkable) {
  const name = exportName(slug, qid)

  const constrained = (pid, array = false) => {
    const enumName = CONSTRAINED[pid]
    const list = refs(e, pid, labels)
    for (const r of list) {
      const allowed = readEnums()[enumName]
      if (allowed && !allowed.has(r.qid)) unknown.set(r.qid, `${pid} ${enumName} (${slug})`)
    }
    const kept = list.filter((r) => !unknown.has(r.qid))
    if (!kept.length) return undefined
    return array ? refArray(kept) : refLiteral(kept[0])
  }

  const taxonRank = refs(e, P.taxonRank, labels)[0]

  const lines = []
  lines.push(`// Wikidata data for ${scientificName} (${qid})`)
  lines.push('// Generated by scripts/fetch-species-wikidata.mjs -- do not edit by hand.')
  lines.push("import type { WikidataSpeciesData } from './types'")
  lines.push('')
  lines.push(`export const ${name}: WikidataSpeciesData = {`)
  lines.push(`  slug: ${j(slug)},`)
  lines.push(`  wikidataId: ${j(qid)},`)
  lines.push(
    `  taxonomy: ${object([
      ['taxonName', j(stringsOf(e, P.taxonName)[0] ?? scientificName)],
      ['taxonRank', taxonRank ? refLiteral(taxonRank) : undefined],
      [
        'parentTaxon',
        refs(e, P.parentTaxon, labels).length
          ? refArray(refs(e, P.parentTaxon, labels))
          : undefined,
      ],
      [
        'instanceOf',
        refs(e, P.instanceOf, labels).length ? refArray(refs(e, P.instanceOf, labels)) : undefined,
      ],
      [
        'basionym',
        refs(e, P.basionym, labels).length ? refArray(refs(e, P.basionym, labels)) : undefined,
      ],
      [
        'authorCitation',
        stringsOf(e, P.authorCitation)[0] ? j(stringsOf(e, P.authorCitation)[0]) : undefined,
      ],
      ['shortName', stringsOf(e, P.shortName)[0] ? j(stringsOf(e, P.shortName)[0]) : undefined],
    ])},`,
  )

  const labelBlock = {}
  const descBlock = {}
  const aliasBlock = {}
  for (const l of LANGS) {
    if (e?.labels?.[l]?.value) labelBlock[l] = j(e.labels[l].value)
    if (e?.descriptions?.[l]?.value) descBlock[l] = j(e.descriptions[l].value)
    if ((e?.aliases?.[l] ?? []).length) {
      aliasBlock[l] = `[${e.aliases[l].map((a) => j(a.value)).join(', ')}]`
    }
  }
  const common = localized(e, P.commonNames)
  lines.push(
    `  names: ${object([
      ['labels', langObject(labelBlock)],
      ['descriptions', langObject(descBlock)],
      ['aliases', langObject(aliasBlock)],
      [
        'commonNames',
        `[${common.map((c) => `{ lang: ${j(c.lang)}, value: ${j(c.value)} }`).join(', ')}]`,
      ],
    ])},`,
  )

  lines.push(
    `  morphology: ${object([
      ['hymeniumType', constrained(P.hymeniumType)],
      ['capShape', constrained(P.capShape, true)],
      ['hymeniumAttachment', constrained(P.hymeniumAttachment)],
      ['stipeCharacter', constrained(P.stipeCharacter)],
      ['sporePrintColor', constrained(P.sporePrintColor)],
    ])},`,
  )
  lines.push(`  ecology: ${object([['ecologicalType', constrained(P.ecologicalType, true)]])},`)

  const conservation = refs(e, P.conservationStatus, labels)
  lines.push(
    `  edibility: ${object([
      ['values', constrained(P.edibility, true) ?? '[]'],
      ['conservationStatus', conservation.length ? refArray(conservation) : undefined],
    ])},`,
  )

  const images = valuesOf(e, P.images)
  lines.push(
    `  media: ${object([
      ['images', `[${images.map((f) => j(f)).join(', ')}]`],
      [
        'commonsCategory',
        stringsOf(e, P.commonsCategory)[0] ? j(stringsOf(e, P.commonsCategory)[0]) : undefined,
      ],
      [
        'commonsGallery',
        stringsOf(e, P.commonsGallery)[0] ? j(stringsOf(e, P.commonsGallery)[0]) : undefined,
      ],
    ])},`,
  )

  const ids = []
  for (const [pid, source] of Object.entries(EXTERNAL_IDS)) {
    const template = formatters.get(pid)
    for (const v of stringsOf(e, pid)) {
      if (!template) {
        // No formatter URL means we cannot build a link, and an unlinkable id
        // is not a useful "source". Skip it rather than emit a broken one.
        unlinkable.add(pid)
        continue
      }
      ids.push(
        `{ pid: ${j(pid)}, source: ${j(source)}, value: ${j(v)}, url: ${j(formatExternalUrl(template, v))} }`,
      )
    }
  }
  lines.push(`  externalIds: [${ids.join(', ')}],`)
  lines.push('}')
  lines.push('')
  lines.push(`export default ${name}`)
  return lines.join('\n') + '\n'
}

function renderIndex(manifest) {
  const imports = manifest
    .slice()
    .sort((a, b) => a.qid.localeCompare(b.qid))
    .map((m) => `import { ${exportName(m.slug, m.qid)} } from './${m.qid}'`)
  const entries = manifest
    .slice()
    .sort((a, b) => a.qid.localeCompare(b.qid))
    .map((m) => `  ${m.qid}: ${exportName(m.slug, m.qid)},`)
  return [
    '// Generated by scripts/fetch-species-wikidata.mjs -- do not edit by hand.',
    // `export type * from` re-exports the shapes but does not bind them in this
    // module's scope, so the annotation below needs a real import as well.
    "export type * from './types'",
    "import type { WikidataSpeciesData } from './types'",
    '',
    ...imports,
    '',
    'export interface SpeciesSnapshotMeta {',
    '  slug: string',
    '  scientificName: string',
    '}',
    '',
    '/** Every fetched species, keyed by its Wikidata QID.',
    ' *',
    ' *  Join it against the content collection through',
    ' *  `speciesEntry.data.wikidataId`; that field is optional in the schema, so',
    ' *  a lookup can legitimately come back undefined. */',
    'export const speciesWikidata: Record<string, WikidataSpeciesData> = {',
    ...entries,
    '}',
    '',
    'export const speciesWikidataMeta: Record<string, SpeciesSnapshotMeta> = {',
    ...manifest
      .slice()
      .sort((a, b) => a.qid.localeCompare(b.qid))
      .map((m) => `  ${m.qid}: { slug: ${j(m.slug)}, scientificName: ${j(m.scientificName)} },`),
    '}',
    '',
    '/** The QIDs that have a snapshot, for asserting coverage against the collection. */',
    'export const speciesWikidataQids: string[] = Object.keys(speciesWikidata)',
    '',
  ].join('\n')
}

async function main() {
  const species = []
  const skipped = []
  for (const slug of readdirSync(SPECIES_DIR).sort()) {
    const file = path.join(SPECIES_DIR, slug, 'index.json')
    if (!existsSync(file)) continue
    const doc = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!doc.wikidataId) {
      skipped.push(slug)
      continue
    }
    species.push({ slug, scientificName: doc.scientificName, qid: doc.wikidataId })
  }

  console.log(`[species-data] ${species.length} species with a QID, ${skipped.length} skipped`)
  if (skipped.length) console.log(`[species-data] no wikidataId: ${skipped.join(', ')}`)

  console.log(`[species-data] fetching ${species.length} entities`)
  const ents = await entities(
    species.map((s) => s.qid),
    { props: 'labels|descriptions|aliases|claims', languages: LANGS.join('|') },
  )

  // One batched label lookup for every item-valued property, so the emitted TS
  // carries readable labels and consumers never need a second request.
  const referenced = new Set()
  for (const pid of [
    P.taxonRank,
    P.parentTaxon,
    P.instanceOf,
    P.basionym,
    P.hymeniumType,
    P.capShape,
    P.hymeniumAttachment,
    P.stipeCharacter,
    P.sporePrintColor,
    P.ecologicalType,
    P.edibility,
    P.conservationStatus,
  ]) {
    for (const { qid } of species) for (const q of qidsOf(ents.get(qid), pid)) referenced.add(q)
  }
  console.log(`[species-data] resolving ${referenced.size} referenced item labels`)
  const labels = await labelMap([...referenced], { languages: LANGS })

  // Formatter URLs come from the identifier properties themselves (P1630), so a
  // source that reorganises its site does not leave 47 dead links behind.
  console.log('[species-data] reading formatter URLs from the identifier properties')
  const formatters = await formatterUrls(Object.keys(EXTERNAL_IDS))

  await fs.mkdir(OUT_DIR, { recursive: true })
  const unknown = new Map()
  const unlinkable = new Set()
  const opts = { parser: 'typescript', semi: false, singleQuote: true, printWidth: 100 }

  let written = 0
  for (const { slug, scientificName, qid } of species) {
    const e = ents.get(qid)
    const text = await format(
      render(slug, scientificName, qid, e, labels, unknown, formatters, unlinkable),
      opts,
    )
    const file = path.join(OUT_DIR, `${qid}.ts`)
    if (!FORCE && existsSync(file) && (await fs.readFile(file, 'utf8')) === text) continue
    await fs.writeFile(file, text)
    written++
  }

  // Prune snapshots for species that no longer exist, so a deleted species does
  // not leave a stale module behind that still typechecks and still gets bundled.
  const keep = new Set([...species.map((s) => `${s.qid}.ts`), 'index.ts', 'types.ts'])
  let pruned = 0
  for (const name of await fs.readdir(OUT_DIR)) {
    if (!name.endsWith('.ts') || keep.has(name)) continue
    await fs.unlink(path.join(OUT_DIR, name))
    pruned++
  }

  const manifest = species.map((s) => ({ ...s }))
  const indexText = await format(renderIndex(manifest), opts)
  const indexPath = path.join(OUT_DIR, 'index.ts')
  if (FORCE || !existsSync(indexPath) || (await fs.readFile(indexPath, 'utf8')) !== indexText) {
    await fs.writeFile(indexPath, indexText)
  }

  console.log(`[species-data] wrote ${written} of ${species.length}, pruned ${pruned}`)
  if (unknown.size) {
    console.log(
      `\n[species-data] ${unknown.size} value(s) missing from morphology-types.ts. They were` +
        '\n             omitted, so the species is incomplete and `astro check` will flag it.' +
        '\n             Add the QID(s) to the enum:',
    )
    for (const [qid, where] of unknown) console.log(`  ${qid}  ${where}`)
  } else {
    console.log('[species-data] every constrained value is a known enum member')
  }
  for (const pid of unlinkable) {
    console.log(
      `[species-data] ${pid} has no formatter URL (P1630); its ids were skipped rather ` +
        'than emitted without a link',
    )
  }
  if (skipped.length) console.log(`[species-data] ${skipped.length} species left without data`)
}

main().catch((err) => {
  console.error('[species-data] failed:', err)
  process.exit(1)
})
