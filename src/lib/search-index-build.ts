// Build-time half of the header search. The client half is `./fuzzy-search`, and
// the two only ever meet through the `SearchRecord` shape.
//
// This split is the same one `./species-facets-build` uses: the matching rules
// live in a DOM-free module so the browser and `scripts/check-search-ranking.mjs`
// agree on them, while the code that has to touch a content collection stays on
// this side of the boundary and out of the client bundle.
//
// Neither import here is a runtime import -- `CollectionEntry` and `SearchRecord`
// are both types -- so `node --experimental-strip-types` can load this file from
// a plain script without Astro being involved at all.

import type { CollectionEntry } from 'astro:content'
import type { SearchRecord } from './fuzzy-search'

export type SpeciesEntry = CollectionEntry<'species'>

/**
 * Flatten the species collection into the payload served at
 * `/search-index.json`.
 *
 * `slug` is the collection id rather than anything in the entry's data because
 * the id is what builds the species URL, so the client is never told how to
 * construct a link -- and a slug recorded in the data could drift from the
 * directory name without anything noticing.
 *
 * Both locale names are always emitted, even though a suggestion shows only one
 * as its headline: searching is locale-independent, so the English page answers a
 * German query and vice versa. That also makes one file serve every locale, so it
 * is fetched once and stays cached when the reader switches between them.
 *
 * Sorted by slug so a rebuild that changes nothing produces a byte-identical
 * file -- `getCollection` order follows the loader and is not worth depending on.
 */
export function buildSearchIndex(entries: readonly SpeciesEntry[]): SearchRecord[] {
  return entries
    .map((entry) => ({
      slug: entry.id,
      scientific: entry.data.scientificName,
      en: entry.data.commonName.en,
      de: entry.data.commonName.de,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}
