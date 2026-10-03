// Shared Wikidata API client for the maintenance scripts.
//
// The three entry points that talk to Wikidata -- the species QID resolver, the
// species data fetcher and the icon downloader -- all need the same retry and
// claim-parsing behaviour. Keeping it here means the rate-limit handling is
// written once: the endpoint answers 429 readily from a shared IP and a fix
// that only lands in one script silently leaves the other flaky.

import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..')

export const WD_API = 'https://www.wikidata.org/w/api.php'
export const USER_AGENT =
  'mushrooms-astro-site/1.0 (fungal taxonomy/Wikidata maintenance; https://github.com/) node-fetch'

/** Wikidata limits a single `wbgetentities` call to 50 ids for anonymous clients. */
export const ENTITY_BATCH = 50

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GET a URL, retrying the statuses that are actually transient.
 *
 * `Retry-After` is honoured when present (the endpoint does send it on a 429);
 * otherwise back off exponentially. Anything else -- a 404, a 403 -- throws
 * immediately, because retrying those just wastes the budget.
 */
export async function fetchRetry(url, tries = 4, log = console.log) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (res.ok) return res
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const hinted = Number(res.headers.get('retry-after'))
      const pause =
        Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 : 1000 * 2 ** (attempt - 1)
      log(`  ${res.status}, retrying in ${Math.round(pause / 1000)}s`)
      await sleep(pause)
      continue
    }
    throw new Error(`${res.status} ${res.statusText}`)
  }
}

/** Fetch entities for `qids` (any number; chunked internally) as a Map. */
export async function entities(
  qids,
  { props = 'labels|claims|descriptions', languages = 'en', log = console.log } = {},
) {
  const out = new Map()
  const list = [...new Set(qids)]
  for (let i = 0; i < list.length; i += ENTITY_BATCH) {
    const chunk = list.slice(i, i + ENTITY_BATCH)
    const url =
      `${WD_API}?action=wbgetentities&format=json&props=${encodeURIComponent(props)}` +
      `&languages=${encodeURIComponent(languages)}&ids=${chunk.join('|')}`
    const json = await (await fetchRetry(url, 4, log)).json()
    for (const [qid, entity] of Object.entries(json.entities ?? {})) out.set(qid, entity)
    if (i + ENTITY_BATCH < list.length) await sleep(150)
  }
  return out
}

/** The value ids of an entity's claims for one property. */
export const qidsOf = (entity, pid) =>
  (entity?.claims?.[pid] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean)

/**
 * The string values of an entity's claims for one property.
 *
 * P225 is a string property and the API returns `datavalue.value` as a bare
 * string, not the `{ text, language }` object that monolingual values used to
 * be shaped like -- so accept both.
 */
export const stringsOf = (entity, pid) =>
  (entity?.claims?.[pid] ?? [])
    .map((c) => {
      const v = c.mainsnak?.datavalue?.value
      if (typeof v === 'string') return v
      if (v && typeof v.text === 'string') return v.text
      return null
    })
    .filter((v) => v !== null)

/** The distinct non-item value objects of a property, e.g. Commons filenames. */
export const valuesOf = (entity, pid) =>
  (entity?.claims?.[pid] ?? [])
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v) => v !== undefined && v !== null)

export const labelOf = (entity) => entity?.labels?.en?.value ?? null

/** Build a lookup of English labels, for when only a handful of ids are wanted. */
export async function labelMap(qids, { log = console.log } = {}) {
  const ents = await entities(qids, { props: 'labels', log })
  const out = new Map()
  for (const qid of new Set(qids)) out.set(qid, labelOf(ents.get(qid)) ?? qid)
  return out
}
