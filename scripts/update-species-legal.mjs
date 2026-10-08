#!/usr/bin/env node
// Match the German foraging-status sources against the species collection and
// emit a typed TS module under src/data/legal.
//
// Two inputs, two questions:
//   * BArtSchV Annex 1 + Section 2(1)  -- "may I pick this species at all?"
//     (federal species protection; the exemption list is the small-quantity /
//     personal-use carve-out for Boletus edulis, Cantharellus, Gomphus,
//     Lactarius volemus, Leccinum and Morchella).
//   * Red List of macrofungi (Dämmrich et al. 2016, BfN) -- "how threatened
//     is it?" -- a conservation status, deliberately kept separate from the
//     legal one above.
//
// Raw sources are cached in .cache/legal (gitignored), so a re-run for a
// newly added species costs no network. --force refetches. Generated files
// are not meant to be edited by hand; snapshots are committed, and the build
// never runs this script.
import { promises as fs, existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { format } from 'prettier'
import * as XLSX from 'xlsx'
import { ROOT } from './lib/col.mjs'
import {
  BARTSCHV_ANLAGE_1_URL,
  BARTSCHV_SECTION_2_URL,
  RED_LIST_ZIP_URL,
  RED_LIST_CITATION,
} from './config/foraging.mjs'

const SPECIES_DIR = path.join(ROOT, 'src', 'content', 'species')
const TAXONOMY_DIR = path.join(ROOT, 'src', 'data', 'taxonomy', 'species')
const OUT_FILE = path.join(ROOT, 'src', 'data', 'legal', 'foraging-de.ts')
const CACHE_DIR = path.join(ROOT, '.cache', 'legal')
const RL_DIR = path.join(CACHE_DIR, 'rl')
const FORCE = process.argv.includes('--force')
const VERBOSE = process.argv.includes('--verbose')

const j = JSON.stringify
const PRETTIER = { parser: 'typescript', semi: false, singleQuote: true, printWidth: 100 }

// --- small helpers ---------------------------------------------------------

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

const stripTags = (html) => decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ')

// A law table cell carries footnote markers ("Boletus edulis Bull. ex Fr. 7) 8)")
// and parenthetical authorship; only the genus and the epithet matter here.
// Returns '' for anything that is not a binomial or a genus-level "spp." entry.
function lawBinomial(raw) {
  const cleaned = String(raw)
    .replace(/\d+\)/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .trim()
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return ''
  const [genus, second] = tokens
  if (!/^[A-ZÄÖÜ][a-zäöüß-]+$/.test(genus)) return ''
  if (/^spp\.?$/.test(second)) return `${genus} spp.`
  if (!/^[a-zäöüß-]+$/.test(second)) return ''
  return `${genus} ${second}`
}

// Binomial of any scientific name (ours, the law's or the Red List's),
// authorship and infraspecific tail dropped. '' for genus-only strings.
function binomialOf(name) {
  const cleaned = String(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*[≙≛≟≠~]\s*/, ' ')
    .trim()
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return ''
  if (/^spp\.?$/.test(tokens[1])) return `${tokens[0]} spp.`
  if (!/^[a-zäöüß-]+$/.test(tokens[1])) return ''
  return `${tokens[0]} ${tokens[1]}`
}

const key = (binomial) => binomial.toLowerCase()

// Words that can follow a capitalised German common name and must not be
// mistaken for a specific epithet when scanning the Section 2(1) sentence.
const EPIPHET_STOPWORDS = new Set([
  'und',
  'oder',
  'die',
  'der',
  'das',
  'den',
  'dem',
  'des',
  'alle',
  'sowie',
  'für',
  'mit',
  'von',
  'vom',
  'im',
  'in',
  'auf',
  'aus',
  'zu',
  'zur',
  'zum',
  'an',
  'am',
  'bei',
  'nur',
  '-',
])

// --- fetching --------------------------------------------------------------

async function cached(url, file, { binary = false } = {}) {
  const dest = path.join(CACHE_DIR, file)
  let buf
  if (!FORCE && existsSync(dest)) {
    buf = await fs.readFile(dest)
  } else {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    const res = await fetch(url, { headers: { 'user-agent': 'myco.log data update script' } })
    if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(dest, buf)
    console.log(`[legal] fetched ${url} (${buf.length} bytes)`)
  }
  return binary ? buf : buf.toString('utf8')
}

function unzip(zipFile, dir) {
  try {
    execFileSync('unzip', ['-o', '-q', zipFile, '-d', dir], { stdio: 'pipe' })
  } catch (e) {
    throw new Error(`unzip failed (${e.message}) -- is \`unzip\` installed?`)
  }
}

// --- BArtSchV ---------------------------------------------------------------

// The Annex is one big table; the Fungi section runs from its "Pilze" header
// row to the footnote block that follows the last entry. Every protected entry
// has "+" in its third column; the rows underneath ("| - | alle heimischen
// Arten") only spell out what a genus entry covers and carry no name.
function parseAnlageFungi(html) {
  const start = html.indexOf('>Pilze<')
  if (start < 0) throw new Error('Anlage 1: "Pilze" section header not found')
  const end = html.indexOf('1)Nur europ', start)
  const region = html.slice(start, end > 0 ? end : undefined)
  const entries = []
  for (const row of region.split(/<tr[^>]*>/i).slice(1)) {
    const cells = row
      .split(/<td[^>]*>/i)
      .slice(1)
      .map((c) => stripTags(c).trim())
    if (cells.length < 3 || cells[2] !== '+') continue
    const name = lawBinomial(cells[0])
    if (!name) continue
    entries.push({ name, german: cells[1] })
  }
  if (entries.length === 0) throw new Error('Anlage 1: no fungal entries parsed')
  return entries
}

// Section 2(1) is prose: "... entnommen werden: Boletus edulis Steinpilz
// Cantharellus spp. Pfifferling - alle heimischen Arten ...". Scan the token
// stream *after* the colon looking for capitalised genus + lowercase epithet
// (or "spp."); scanning the whole sentence would match the sentence's own
// "der Natur entnommen" as if it were a name.
function parseSection2Exemptions(html) {
  const text = stripTags(html)
  const from = text.indexOf('eigenen Bedarf der Natur entnommen werden')
  const to = text.indexOf('Die nach Landesrecht zuständige Behörde kann im Einzelfall', from)
  if (from < 0 || to < 0) throw new Error('BArtSchV §2(1): exemption sentence not found')
  const sentence = text.slice(from, to)
  const colon = sentence.indexOf(':')
  if (colon < 0) throw new Error('BArtSchV §2(1): name list separator not found')
  const tokens = sentence
    .slice(colon + 1)
    .split(/\s+/)
    .filter(Boolean)
  const out = []
  for (let i = 0; i < tokens.length - 1; i++) {
    const genus = tokens[i]
    const next = tokens[i + 1]
    if (!/^[A-ZÄÖÜ][a-zäöüß-]+$/.test(genus)) continue
    if (/^spp\.?$/.test(next)) out.push(`${genus} spp.`)
    else if (/^[a-zäöüß-]{4,}$/.test(next) && !EPIPHET_STOPWORDS.has(next))
      out.push(`${genus} ${next}`)
  }
  const unique = [...new Set(out)]
  if (unique.length === 0) throw new Error('BArtSchV §2(1): no exemption names parsed')
  return unique
}

// --- Red List ---------------------------------------------------------------

// Species-level rows outrank aggregate/infraspecific ones, so a binomial that
// appears both ways resolves to the row that actually assessed the species.
const SPECIES_LEVEL_AUSWERTUNG = new Set(['S', 'M'])

function redListNames(row, idx) {
  const names = [row[idx.Name], row[idx.Synonyme], row[idx.Konzeptbeziehungen]]
  return names
    .map((v) => binomialOf(v))
    .filter(Boolean)
    .map((b) => ({ binomial: b, via: b === binomialOf(row[idx.Name]) ? 'name' : 'concept' }))
}

async function parseRedListTables() {
  await cached(RED_LIST_ZIP_URL, 'red-list-grosspilze.zip', { binary: true })
  if (FORCE || !existsSync(RL_DIR)) {
    await fs.mkdir(RL_DIR, { recursive: true })
    unzip(path.join(CACHE_DIR, 'red-list-grosspilze.zip'), RL_DIR)
  }
  const files = readdirSync(RL_DIR).filter(
    (f) => f.startsWith('02_Datentabelle') && f.endsWith('.xlsx'),
  )
  if (files.length !== 2)
    throw new Error(`Red List: expected 2 data tables in ${RL_DIR}, found ${files.length}`)

  const index = new Map()
  for (const file of files) {
    const wb = XLSX.read(readFileSync(path.join(RL_DIR, file)), { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    const idx = Object.fromEntries(rows[0].map((h, i) => [String(h), i]))
    for (const required of ['Name', 'RL Kat.', 'Auswertung'])
      if (!(required in idx)) throw new Error(`${file}: column "${required}" missing`)
    for (const row of rows.slice(1)) {
      const code = String(row[idx['RL Kat.']] ?? '').trim()
      if (!code) continue
      const speciesLevel = SPECIES_LEVEL_AUSWERTUNG.has(String(row[idx.Auswertung]))
      for (const { binomial, via } of redListNames(row, idx)) {
        const k = key(binomial)
        // A row that *is* the name beats a row that merely lists it as a
        // synonym, and a species-level assessment beats an aggregate -- the
        // other way round, Boletus edulis resolves to a Boletus betulicola row
        // whose concept column names B. edulis.
        const score = (via === 'name' ? 2 : 0) + (speciesLevel ? 1 : 0)
        const prev = index.get(k)
        if (!prev || prev.score < score)
          index.set(k, { code, speciesLevel, via, score, row: String(row[idx.Name]) })
      }
    }
  }
  return index
}

// --- species collection ------------------------------------------------------

function loadSpecies() {
  const out = []
  for (const slug of readdirSync(SPECIES_DIR).sort()) {
    const file = path.join(SPECIES_DIR, slug, 'index.json')
    if (!existsSync(file)) continue
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    if (!doc.scientificName) continue
    out.push({ slug, scientificName: doc.scientificName })
  }
  return out
}

// The taxonomy snapshots hold the nomenclatural history that maps a modern
// name onto the 2005-era name the law uses (Butyriboletus appendiculatus
// listed as Boletus appendiculatus). Read textually like
// update-species-taxonomy.mjs does: the barrel's extensionless relative
// imports are not resolvable by Node's ESM loader.
function loadHistoryNames() {
  const map = new Map()
  if (!existsSync(TAXONOMY_DIR)) return map
  for (const file of readdirSync(TAXONOMY_DIR)) {
    const m = file.match(/^(.*)\.ts$/)
    if (!m || m[1] === 'index') continue
    const src = readFileSync(path.join(TAXONOMY_DIR, file), 'utf8')
    const names = [...src.matchAll(/scientificName:\s*(['"])([^'"]*)\1/g)].map((x) => x[2])
    map.set(m[1], [...new Set(names)])
  }
  return map
}

// --- output ------------------------------------------------------------------

function renderTs(entries, sources) {
  const lines = []
  lines.push('// Foraging status for Germany: species protection under the BArtSchV')
  lines.push('// (Annex 1 + §2(1) exemption) and the German Red List of macrofungi.')
  lines.push('// Generated by scripts/update-species-legal.mjs -- do not edit by hand.')
  lines.push('// Regenerate with `npm run update-species-legal` after adding a species.')
  lines.push("import type { ForagingEntry, ForagingSources } from './types'")
  lines.push('')
  lines.push('export const foragingSources: ForagingSources = {')
  lines.push(`  bartschvAnlage1: ${j(sources.bartschvAnlage1)},`)
  lines.push(`  bartschvSection2: ${j(sources.bartschvSection2)},`)
  lines.push(`  redListZip: ${j(sources.redListZip)},`)
  lines.push(`  redListCitation: ${j(sources.redListCitation)},`)
  lines.push(`  retrieved: ${j(sources.retrieved)},`)
  lines.push('}')
  lines.push('')
  lines.push('export const foraging: Record<string, ForagingEntry> = {')
  for (const [slug, entry] of entries) {
    lines.push(`  ${j(slug)}: {`)
    lines.push(`    protection: ${j(entry.protection)},`)
    if (entry.lawName) lines.push(`    lawName: ${j(entry.lawName)},`)
    if (entry.matchedBy) lines.push(`    matchedBy: ${j(entry.matchedBy)},`)
    if (entry.redList)
      lines.push(
        `    redList: { code: ${j(entry.redList.code)}, matchedBy: ${j(entry.redList.matchedBy)} },`,
      )
    lines.push('  },')
  }
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

// --- main -------------------------------------------------------------------

async function main() {
  const log = console.log

  const [anlage, section2] = await Promise.all([
    cached(BARTSCHV_ANLAGE_1_URL, 'bartschv-anlage-1.html'),
    cached(BARTSCHV_SECTION_2_URL, 'bartschv-section-2.html'),
  ])

  const lawEntries = parseAnlageFungi(anlage)
  const exemptions = new Set(parseSection2Exemptions(section2))
  const lawSpecies = new Set(lawEntries.filter((e) => !e.name.endsWith(' spp.')).map((e) => e.name))
  const lawGenera = new Set(
    lawEntries.filter((e) => e.name.endsWith(' spp.')).map((e) => e.name.split(' ')[0]),
  )
  const exemptSpecies = new Set([...exemptions].filter((e) => !e.endsWith(' spp.')))
  const exemptGenera = new Set(
    [...exemptions].filter((e) => e.endsWith(' spp.')).map((e) => e.split(' ')[0]),
  )

  log(
    `[legal] BArtSchV Annex 1: ${lawEntries.length} entries (${lawSpecies.size} species, ${lawGenera.size} genera)`,
  )
  log(`[legal] §2(1) exemptions: ${exemptions.size} (${[...exemptions].join(', ')})`)

  const redList = await parseRedListTables()
  log(`[legal] Red List index: ${redList.size} names`)

  const species = loadSpecies()
  const history = loadHistoryNames()
  log(`[legal] matching ${species.length} species`)

  const results = []
  const matchedLaw = new Set()
  const redListMisses = []
  const counts = { prohibited: 0, smallQuantityExempt: 0, notListed: 0, redList: 0 }

  for (const { slug, scientificName } of species) {
    const historyNames = history.get(slug) ?? []
    // Candidate names, accepted first: the law's 2005 taxonomy and the Red
    // List's both predate several of the site's accepted names.
    const candidates = [...new Set([scientificName, ...historyNames])]
    const acceptedGenus = scientificName.split(' ')[0]

    // A genus-level Annex entry ("Hygrocybe spp.") is tested against the
    // *accepted* genus only. Going through an old combination would flag, say,
    // Rickenella fibula as a Hygrocybe purely because it used to be one --
    // the law froze its names in 2005, and our history includes splits that
    // happened after it.
    let protection = 'notListed'
    let lawName, matchedBy
    if (lawGenera.has(acceptedGenus)) {
      protection = exemptGenera.has(acceptedGenus) ? 'smallQuantityExempt' : 'prohibited'
      lawName = `${acceptedGenus} spp.`
      matchedBy = 'genus'
      matchedLaw.add(lawName)
    } else {
      for (const cand of candidates) {
        const b = binomialOf(cand)
        if (!b || !lawSpecies.has(b)) continue
        protection = exemptSpecies.has(b) ? 'smallQuantityExempt' : 'prohibited'
        lawName = b
        matchedBy = cand === scientificName ? 'accepted' : 'synonym'
        matchedLaw.add(lawName)
        break
      }
    }

    let redListHit
    for (const cand of candidates) {
      const b = binomialOf(cand)
      if (!b) continue
      const hit = redList.get(key(b))
      if (hit) {
        redListHit = { code: hit.code, matchedBy: cand === scientificName ? 'accepted' : 'synonym' }
        if (VERBOSE)
          log(
            `    RL ${hit.code}: our "${b}" <- list row "${hit.row}"` +
              (cand === scientificName ? '' : ' (via synonym)'),
          )
        break
      }
    }
    if (!redListHit) redListMisses.push(slug)
    else counts.redList++
    counts[protection]++
    const entry = { protection }
    if (lawName) entry.lawName = lawName
    if (matchedBy) entry.matchedBy = matchedBy
    if (redListHit) entry.redList = redListHit
    results.push([slug, entry])
    const rl = redListHit ? ` RL ${redListHit.code}` : ' RL -'
    const law = lawName ? `${protection} (${lawName})` : protection
    log(`  ${slug}: ${law}${rl}`)
  }

  const unmatchedLaw = lawEntries.map((e) => e.name).filter((n) => !matchedLaw.has(n))
  log(`[legal] law entries matched: ${matchedLaw.size}/${lawEntries.length}`)
  if (unmatchedLaw.length)
    log(`[legal] law entries not in the collection: ${unmatchedLaw.join(', ')}`)
  log(
    `[legal] protection: ${counts.prohibited} prohibited, ${counts.smallQuantityExempt} exempt, ` +
      `${counts.notListed} not listed; red list: ${counts.redList}/${species.length}`,
  )
  if (redListMisses.length) log(`[legal] no Red List row: ${redListMisses.join(', ')}`)

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  const ts = await format(
    renderTs(results, {
      bartschvAnlage1: BARTSCHV_ANLAGE_1_URL,
      bartschvSection2: BARTSCHV_SECTION_2_URL,
      redListZip: RED_LIST_ZIP_URL,
      redListCitation: RED_LIST_CITATION,
      retrieved: new Date().toISOString().slice(0, 10),
    }),
    PRETTIER,
  )
  const prev = existsSync(OUT_FILE) ? await fs.readFile(OUT_FILE, 'utf8') : ''
  if (prev !== ts) {
    await fs.writeFile(OUT_FILE, ts)
    log(`[legal] wrote ${path.relative(ROOT, OUT_FILE)}`)
  } else {
    log(`[legal] ${path.relative(ROOT, OUT_FILE)} unchanged`)
  }
}

main().catch((err) => {
  console.error('[legal] failed:', err)
  process.exit(1)
})
