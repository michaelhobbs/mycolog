#!/usr/bin/env node
// Resolve every species in src/content/species to its Wikidata QID.
//
// Matching is an exact, case-insensitive equality against `taxon name (P225)`
// rather than a fuzzy search: a `wbsearchentities` hit happily returns a
// synonym, a misspelt name or an unrelated homonym, and a wrong QID stored in
// the content collection is far worse than a missing one. Each hit is then
// checked for `taxon rank (P105) == species` so a genus-level or varietal item
// cannot pass as a species.
//
// Reports what resolved, what did not, and anything suspicious. Run with
// --write to persist the QID into each species' index.json.
//
// Usage:
//   npm run resolve-species-wikidata
//   node scripts/resolve-species-wikidata.mjs --write
import { promises as fs } from 'fs'
import path from 'path'
import { WD_API, ROOT, sleep, fetchRetry, entities, qidsOf, stringsOf } from './lib/wikidata.mjs'

const SPECIES_DIR = path.join(ROOT, 'src', 'content', 'species')
const CACHE_FILE = path.join(ROOT, '.cache', 'wikidata-species-search.json')

const WRITE = process.argv.includes('--write')
const SPECIES_QID = 'Q7432'

async function readSpecies() {
  const slugs = (await fs.readdir(SPECIES_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const found = []
  const empty = []
  for (const slug of slugs) {
    const file = path.join(SPECIES_DIR, slug, 'index.json')
    try {
      const doc = JSON.parse(await fs.readFile(file, 'utf8'))
      found.push({ slug, file, doc })
    } catch {
      empty.push(slug)
    }
  }
  return { found, empty }
}

/** Candidate items for one scientific name, via the wbsearchentities API. */
async function search(name) {
  const url =
    `${WD_API}?action=wbsearchentities&format=json&language=en&uselang=en` +
    `&type=item&limit=10&continue=0&search=${encodeURIComponent(name)}`
  const json = await (await fetchRetry(url)).json()
  return (json.search ?? []).map((r) => r.id)
}

/**
 * Insert `key` into a JSON document as a single new line, leaving every other
 * byte alone.
 *
 * Round-tripping through `JSON.stringify(x, null, 2)` would look simpler but
 * rewrites the whole file: it expands objects that were deliberately kept on
 * one line (`"commonName": { "en": "Cep", ... }`) and Prettier preserves
 * whatever line breaking it is handed. That turned a one-line change into a
 * reformat of all 47 files, so the QID is spliced in as text instead.
 */
function upsert(text, key, value) {
  const existing = new RegExp(`^([ \\t]*)"${key}"\\s*:`, 'm').exec(text)
  if (existing) {
    return text.replace(
      new RegExp(`^([ \\t]*)"${key}"\\s*:.*$`, 'm'),
      `$1"${key}": ${JSON.stringify(value)},`,
    )
  }
  // Put it right after scientificName so it reads as part of the species'
  // identity rather than as trailing metadata.
  const anchor = /^([ \t]*)"scientificName"\s*:.*$/m.exec(text)
  if (!anchor) throw new Error('no scientificName key to anchor the insert to')
  const indent = anchor[1]
  const line = `\n${indent}"${key}": ${JSON.stringify(value)},`
  return text.replace(anchor[0], anchor[0] + line)
}

async function main() {
  const { found, empty } = await readSpecies()
  console.log(`[species] ${found.length} species entries, ${empty.length} empty dirs`)

  if (empty.length) console.log(`[species] empty (no index.json): ${empty.join(', ')}`)

  // 1. Search each scientific name, collecting candidate QIDs. Results are
  //    cached on disk because the search endpoint rate-limits easily and this
  //    list only changes when a species is added.
  console.log('[species] searching Wikidata')
  let cache = {}
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'))
  } catch {
    // No cache yet; that is the normal first run.
  }
  const candidates = new Map()
  for (const s of found) {
    const name = s.doc.scientificName
    if (cache[name]) {
      candidates.set(s.slug, cache[name])
      continue
    }
    const ids = await search(name)
    cache[name] = ids
    candidates.set(s.slug, ids)
    await sleep(250)
  }
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true })
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n')
  console.log(`[species] search cache: ${CACHE_FILE.replace(ROOT + '/', '')}`)

  // 2. Pull every candidate's claims in batched requests.
  const allQids = [...new Set([...candidates.values()].flat())]
  console.log(`[species] verifying ${allQids.length} candidate items`)
  const ents = await entities(allQids, { props: 'labels|claims' })

  // 3. Accept only a candidate whose taxon name matches ours exactly and whose
  //    rank is species; everything else is reported, never guessed.
  const resolved = []
  const unresolved = []
  const flagged = []
  const statusQids = new Set()
  for (const { slug, doc } of found) {
    const name = doc.scientificName
    const exact = []
    for (const qid of candidates.get(slug) ?? []) {
      const e = ents.get(qid)
      const taxonNames = stringsOf(e, 'P225')
      if (!taxonNames.some((t) => t.toLowerCase() === name.toLowerCase())) continue
      exact.push({
        qid,
        label: e?.labels?.en?.value ?? '',
        taxonName: taxonNames.join(' | '),
        isSpecies: qidsOf(e, 'P105').includes(SPECIES_QID),
        // taxon status (P141), e.g. "dubious taxon". Note that P1420
        // (taxon synonym) is deliberately NOT used here: on a species item it
        // means "this taxon has synonyms", which is true of almost every real
        // species and so says nothing about whether the item is the right one.
        status: qidsOf(e, 'P141'),
      })
    }

    if (!exact.length) {
      const seen = (candidates.get(slug) ?? []).slice(0, 3)
      unresolved.push({ slug, name, nearMisses: seen })
      continue
    }
    // Prefer a species-rank item.
    exact.sort((a, b) => Number(b.isSpecies) - Number(a.isSpecies))
    const best = exact[0]

    if (exact.length > 1) {
      flagged.push({
        slug,
        name,
        picked: best.qid,
        because: `${exact.length} items share this exact taxon name`,
        others: exact.slice(1).map((h) => h.qid),
      })
    }
    if (!best.isSpecies) {
      flagged.push({ slug, name, picked: best.qid, because: 'taxon rank is not species' })
    }
    if (best.status.length) {
      for (const q of best.status) statusQids.add(q)
      flagged.push({
        slug,
        name,
        picked: best.qid,
        because: 'carries a taxon status (P141)',
        status: best.status,
      })
    }

    resolved.push({
      slug,
      file: path.join(SPECIES_DIR, slug, 'index.json'),
      doc,
      ...best,
      alsoChecked: exact.length,
    })
  }

  for (const r of resolved) {
    const dup = r.alsoChecked > 1 ? `  (+${r.alsoChecked - 1} other exact item(s))` : ''
    console.log(`  ${r.qid}  ${r.doc.scientificName.padEnd(30)} ${r.slug}${dup}`)
  }

  if (flagged.length) {
    // Resolve what the taxon status actually says, so the report names it.
    let statusLabels = new Map()
    if (statusQids.size) {
      const statusEnts = await entities([...statusQids], { props: 'labels' })
      statusLabels = new Map(
        [...statusQids].map((q) => [q, statusEnts.get(q)?.labels?.en?.value ?? q]),
      )
    }
    console.log(`\n[species] ${flagged.length} to review:`)
    for (const f of flagged) {
      const detail = f.status?.length
        ? ` (${f.status.map((q) => statusLabels.get(q) ?? q).join(', ')})`
        : ''
      console.log(
        `  ${f.slug} -> ${f.picked}: ${f.because}${detail}${f.others ? ` [${f.others.join(', ')}]` : ''}`,
      )
    }
  }

  if (unresolved.length) {
    console.log(`\n[species] NOT FOUND: ${unresolved.length}`)
    for (const u of unresolved) {
      console.log(`  ${u.name.padEnd(30)} (${u.slug})`)
      if (u.nearMisses.length) console.log(`      closest items: ${u.nearMisses.join(', ')}`)
    }
  } else {
    console.log('\n[species] all names resolved')
  }

  if (!WRITE) {
    console.log('\n[species] dry run; pass --write to save')
    return
  }

  let changed = 0
  for (const r of resolved) {
    if (r.doc.wikidataId === r.qid) continue
    const text = await fs.readFile(r.file, 'utf8')
    const next = upsert(text, 'wikidataId', r.qid)
    await fs.writeFile(r.file, next)
    changed++
  }
  console.log(`\n[species] wrote wikidataId to ${changed} of ${resolved.length} entries`)
  if (unresolved.length) console.log(`[species] ${unresolved.length} left without a QID`)
}

main().catch((err) => {
  console.error('[species] failed:', err)
  process.exit(1)
})
