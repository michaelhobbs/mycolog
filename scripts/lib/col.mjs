// Shared ChecklistBank (Catalogue of Life) API client for maintenance scripts.
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..')

export const COL_API_BASE = 'https://api.checklistbank.org'
export const USER_AGENT =
  'mushrooms-astro-site/1.0 (fungal taxonomy/COL maintenance; https://github.com/) node-fetch'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

// Find COL datasets matching query
export async function findDatasets(
  q = 'Catalogue of Life',
  { limit = 20, log = console.log } = {},
) {
  const url = `${COL_API_BASE}/dataset?q=${encodeURIComponent(q)}&limit=${limit}`
  const res = await fetchRetry(url, 4, log)
  const data = await res.json()
  return data.result || []
}

// Search for name usages in a dataset
export async function searchNameUsages(datasetKey, name, { limit = 20, log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/nameusage?q=${encodeURIComponent(name)}&limit=${limit}`
  const res = await fetchRetry(url, 4, log)
  const data = await res.json()
  return data.result || []
}

// Best match for a scientific name. Unlike the free-text `nameusage?q=` search,
// this understands binomials and carries the matched usage's rank, so a caller
// can reject a genus-level fallback for a species name. Returns null when
// nothing matches.
export async function matchNameUsage(datasetKey, name, { log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/match/nameusage?q=${encodeURIComponent(name)}`
  const res = await fetchRetry(url, 4, log)
  const data = await res.json()
  return data.usage || null
}

// Get a specific name usage by ID
export async function getNameUsage(datasetKey, usageId, { log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/nameusage/${usageId}`
  const res = await fetchRetry(url, 4, log)
  return res.json()
}

// Usage plus its classification chain (kingdom -> genus), where each entry is
// { rank, name, id }. This is the endpoint behind a catalogueoflife.org taxon
// page. Returns null for a taxon id that does not exist in the dataset.
export async function getTaxonInfo(datasetKey, taxonId, { log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/taxon/${taxonId}/info`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// Get a nomenclatural name record by name ID (carries authorship, publishedInId, etc.)
export async function getName(datasetKey, nameId, { log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/name/${nameId}`
  const res = await fetchRetry(url, 4, log)
  return res.json()
}

// Nomenclatural relations for a name (e.g. type "basionym"), each with relatedNameId.
export async function getNameRelations(datasetKey, nameId, { log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/name/${nameId}/relations`
  const res = await fetchRetry(url, 4, log)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

// Direct children of a taxon (infraspecific usages under a species, etc.)
export async function getTreeChildren(
  datasetKey,
  taxonId,
  { limit = 1000, log = console.log } = {},
) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/tree/${taxonId}/children?limit=${limit}`
  const res = await fetchRetry(url, 4, log)
  const data = await res.json()
  return data.result || []
}

// Homotypic + heterotypic synonyms of a taxon.
export async function getSynonyms(datasetKey, taxonId, { log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/taxon/${taxonId}/synonyms`
  const res = await fetchRetry(url, 4, log)
  const data = await res.json()
  return {
    homotypic: data.homotypic || [],
    heterotypic: data.heterotypic || [],
  }
}

// A reference record (its `year` field is the publication year of the name).
export async function getReference(datasetKey, referenceId, { log = console.log } = {}) {
  const url = `${COL_API_BASE}/dataset/${datasetKey}/reference/${referenceId}`
  const res = await fetchRetry(url, 4, log)
  return res.json()
}
