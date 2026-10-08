// Ranking fixture for the header search's fuzzy matcher.
//
// The thresholds in `src/lib/fuzzy-search.ts` are tuned, and tuned numbers rot
// silently: loosening `MIN_DICE` or dropping `MIN_FUZZY_LEN` would make the search
// feel cleverer while making it wrong, and nothing in the type system would
// notice. This script pins the behaviour against the *real* species collection,
// so the two sides cannot drift: it builds the index with the same
// `buildSearchIndex` the endpoint uses, then ranks with the same `search` the
// browser uses.
//
// Run with `npm run check:search`. Exits non-zero on any mismatch.
//
// It reads the content files directly rather than going through `getCollection`,
// because that needs Astro's virtual module -- and because asserting against the
// files on disk is what makes this check independent of a build having run.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSearchIndex } from '../src/lib/search-index-build.ts'
import { MAX_SUGGESTIONS, highlightRanges, search } from '../src/lib/fuzzy-search.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const speciesDir = join(root, 'src', 'content', 'species')

/** Shaped like a `CollectionEntry<'species'>`; only the fields read are present. */
const entries = readdirSync(speciesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => {
    const data = JSON.parse(readFileSync(join(speciesDir, dirent.name, 'index.json'), 'utf8'))
    return { id: dirent.name, data }
  })

const records = buildSearchIndex(entries)
const slugs = new Set(records.map((record) => record.slug))

/**
 * Every case is `query -> expected top result`, or `query -> null` for a query
 * that must find nothing at all.
 *
 * The typos are the point. A plain `includes()` matcher already passes the exact
 * and prefix cases, so those are only here to catch a regression in the ranking
 * *order*; the single-edit and multi-edit misspellings are what the fuzzy layer
 * exists for.
 */
const cases = [
  // Exact names, and the locale each locale shows as its headline.
  { query: 'fly agaric', locale: 'en', expect: 'amanita-muscaria' },
  { query: 'Fliegenpilz', locale: 'de', expect: 'amanita-muscaria' },
  { query: 'Fliegenpilz', locale: 'en', expect: 'amanita-muscaria' },

  // Case and diacritics are folded away, in both directions.
  { query: 'FLIEGENPILZ', locale: 'de', expect: 'amanita-muscaria' },
  // "Kuhröhrling" (suillus-bovinus) is a single compound ending in -röhrling
  // and so outranks "Satans-Röhrling" for a bare "rohrling" query.
  { query: 'rohrling', locale: 'de', expect: 'suillus-bovinus' },
  { query: 'RÖHRLING', locale: 'de', expect: 'suillus-bovinus' },

  // Prefixes and partial words: the German common names are compounds, so a
  // reader routinely types half of one.
  { query: 'anhansel', locale: 'de', expect: 'butyriboletus-appendiculatus' },
  { query: 'knollenblatter', locale: 'de', expect: 'amanita-phalloides' },

  // Single-edit typos, including transpositions.
  { query: 'flignpilz', locale: 'de', expect: 'amanita-muscaria' },
  { query: 'harmasch', locale: 'de', expect: 'armillaria-mellea' },
  { query: 'canterelle', locale: 'en', expect: 'cantharellus-cibarius' },
  { query: 'fliegenpils', locale: 'de', expect: 'amanita-muscaria' },

  // A multi-edit misspelling that an edit-distance gate rejects and a trigram
  // overlap does not.
  { query: 'flugelpilz', locale: 'de', expect: 'amanita-muscaria' },

  // Scientific names, and a full binomial.
  { query: 'boletus edulis', locale: 'en', expect: 'boletus-edulis' },
  { query: 'muscaria', locale: 'en', expect: 'amanita-muscaria' },
  { query: 'amanita pantherina', locale: 'en', expect: 'amanita-pantherina' },

  // Entries with no German name still resolve, via the English one.
  { query: 'wood hedgehog', locale: 'de', expect: 'hydnum-repandum' },
  { query: 'common funnel', locale: 'de', expect: 'infundibulicybe-gibba' },

  // Nonsense must find nothing rather than return whatever is least wrong.
  { query: 'zzzz', locale: 'de', expect: null },
  { query: 'wucht', locale: 'de', expect: null },
  { query: 'xymyc', locale: 'en', expect: null },

  // A query whose second token cannot match must not fall back to the first
  // token's match: this is the conjunction that keeps "edulis zzzz" off
  // *Boletus edulis*.
  { query: 'edulis zzzz', locale: 'en', expect: null },

  // The boundary of `MIN_FUZZY_LEN`, stated from both sides. Four characters is
  // enough for a trigram to mean something, so `flig` fuzzily reaches
  // *Fliegenpilz*; three is not, so `flg` finds nothing at all rather than
  // guessing. That is the documented cost of not letting "gift" match *Common
  // Split Gill*.
  { query: 'flig', locale: 'de', expect: 'amanita-muscaria' },
  { query: 'flg', locale: 'de', expect: null },
  { query: 'flg', locale: 'en', expect: null },
]

let failures = 0

for (const { query, locale, expect } of cases) {
  const results = search(records, query, locale)
  const top = results[0]?.record.slug ?? null
  const ok = top === expect
  if (!ok) failures++
  const got = top === null ? '(nothing)' : `${top}`
  const want = expect === null ? '(nothing)' : expect
  const detail = results
    .slice(0, 3)
    .map((r) => `${r.record.slug}=${Math.round(r.score)}`)
    .join(' ')
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${query.padEnd(18)} ${locale}  ${got.padEnd(34)} ${detail}`)
  if (!ok) console.log(`       expected: ${want}`)
}

/* ── Shape invariants ───────────────────────────────────────────────────── */

const shapeProblems = []

if (records.length !== entries.length) {
  shapeProblems.push(`${records.length} records for ${entries.length} entries`)
}
for (const record of records) {
  if (!record.slug) shapeProblems.push(`empty slug: ${JSON.stringify(record)}`)
  if (!record.scientific) shapeProblems.push(`${record.slug}: no scientific name`)
  // Nine entries have no German name; that is a content gap, not a bug, so this
  // asserts the *fallback* rather than demanding a translation.
  if (!record.en && !record.de) shapeProblems.push(`${record.slug}: no common name at all`)
  for (const locale of ['en', 'de']) {
    const results = search(records, record[locale] || record.scientific, locale)
    if (results[0]?.record.slug !== record.slug) {
      shapeProblems.push(
        `${record.slug}: searching its own ${locale} name returns ${results[0]?.record.slug ?? 'nothing'}`,
      )
    }
  }
}

for (const problem of shapeProblems) console.log(`FAIL shape: ${problem}`)
failures += shapeProblems.length

/* ── Ordering invariants ────────────────────────────────────────────────── */

// A shared prefix must not put the more specific species second: "pfifferling"
// is *Cantharellus cibarius*, not the waxcap that merely also says Pfifferling.
const ordering = [
  { query: 'pfifferling', locale: 'de', first: 'cantharellus-cibarius' },
  { query: 'tintling', locale: 'de', first: 'coprinus-comatus' },
]
for (const { query, locale, first } of ordering) {
  const top = search(records, query, locale)[0]?.record.slug
  const ok = top === first
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} order: ${query} -> ${top} (want ${first})`)
}

// The result list is capped, so the component can rely on a short list.
const capped = search(records, 'pilz', 'de')
const okCapped = capped.length <= MAX_SUGGESTIONS
if (!okCapped) failures++
console.log(
  `${okCapped ? 'ok  ' : 'FAIL'} cap: "pilz" returned ${capped.length} (max ${MAX_SUGGESTIONS})`,
)

/* ── Highlight invariants ───────────────────────────────────────────────── */

/**
 * Paint the ranges the way `SiteSearch` does and compare the whole string, so a
 * range that is off by one shows up as a shifted bracket rather than as an
 * identical-looking result.
 *
 * The interesting cases are the ones where folded space and displayed space
 * differ: `flignpilz` is not a substring of `Fliegenpilz` at all, yet the reader
 * still expects to see *something* lit up on the row they are about to pick.
 */
const highlightCases = [
  { text: 'Steinpilz', query: 'stein', want: '[Stein]pilz' },
  { text: 'Boletus edulis', query: 'boletus edulis', want: '[Boletus edulis]' },
  { text: 'Cantharellus cibarius', query: 'cibarius', want: 'Cantharellus [cibarius]' },

  // Folding happens on the way in; the *original* characters come back out.
  { text: 'Röhrling', query: 'rohrling', want: '[Röhrling]' },
  { text: 'Anhängsel-Röhrling', query: 'anhansel', want: '[Anhängsel]-Röhrling' },

  // A typo highlights the word it is a typo of -- the row's whole point.
  { text: 'Fliegenpilz', query: 'flignpilz', want: '[Fliegenpilz]' },

  // Below MIN_FUZZY_LEN and not a substring: nothing is claimed, because the
  // matcher would not have claimed it either.
  { text: 'Fliegenpilz', query: 'fg', want: 'Fliegenpilz' },
  { text: 'Fly Agaric', query: 'zzzz', want: 'Fly Agaric' },
]

for (const { text, query, want } of highlightCases) {
  const ranges = highlightRanges(text, query)
  let painted = ''
  let at = 0
  let structurallySound = true
  for (const [start, end] of ranges) {
    if (start < at || end <= start || end > text.length) structurallySound = false
    painted += text.slice(at, start) + `[${text.slice(start, end)}]`
    at = end
  }
  painted += text.slice(at)
  const ok = structurallySound && painted === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} mark: ${query.padEnd(16)} ${painted}`)
  if (!ok) console.log(`       expected: ${want}`)
}

// Every rendered option line, on the real data: highlighting must never drop,
// duplicate or reorder a character. This is the invariant that lets `paint()` be
// written as "append the gap, then append the mark" with no reconciliation.
const roundTripProblems = []
for (const record of records) {
  const lines = [record.scientific, record.en, record.de].filter(Boolean)
  for (const line of lines) {
    for (const query of ['a', 'boletus', 'pilz', 'xyzzy', 'muscaria']) {
      const ranges = highlightRanges(line, query)
      let rebuilt = ''
      let at = 0
      let sound = true
      for (const [start, end] of ranges) {
        if (start < at || end <= start || end > line.length) sound = false
        rebuilt += line.slice(at, start) + line.slice(start, end)
        at = end
      }
      rebuilt += line.slice(at)
      if (!sound || rebuilt !== line) {
        roundTripProblems.push(`${line} + "${query}": ${ranges.map((r) => r.join('-')).join(' ')}`)
      }
    }
  }
}
for (const problem of roundTripProblems) console.log(`FAIL mark: ${problem}`)
failures += roundTripProblems.length
console.log(
  `${roundTripProblems.length === 0 ? 'ok  ' : 'FAIL'} mark: round-trip over ${records.length} records`,
)

console.log(
  `\n${records.length} species · ${cases.length + ordering.length + 1 + highlightCases.length + 1} checks · ${failures} failure(s)`,
)
if (failures > 0) process.exit(1)
