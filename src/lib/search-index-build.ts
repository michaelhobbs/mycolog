// Build-time half of the header search. The client half is `./fuzzy-search`, and
// the two only ever meet through the `SearchRecord` shape.
//
// This split is the same one `./species-facets-build` uses: the matching rules
// live in a DOM-free module so the browser and `scripts/check-search-ranking.mjs`
// agree on them, while the code that has to touch a content collection stays on
// this side of the boundary and out of the client bundle.
//
// Only type imports point at Astro or the Wikidata snapshots -- `CollectionEntry`,
// `SearchRecord`, `WikidataSpeciesData` -- so `node --experimental-strip-types`
// can load this file from a plain script without Astro being involved at all.
// The one value import, `fold`, is shared with `./fuzzy-search` itself.

import type { CollectionEntry } from 'astro:content'
import type { SearchRecord } from './fuzzy-search'
import { fold } from './fuzzy-search.ts'
import type { WikidataSpeciesData } from '../data/wikidata/species/types'

export type SpeciesEntry = CollectionEntry<'species'>

/** The per-species Wikidata snapshots, keyed by QID as the barrel exports them. */
export type WikidataByQid = Record<string, WikidataSpeciesData>

/**
 * The names a reader may type that are not the site's own: Wikidata's
 * `taxon common name (P1843)` and its aliases, restricted to the languages the
 * species page actually displays them in -- the two site locales, plus Bavarian,
 * which gets a row of its own. Every other language is dropped: a Belorussian
 * common name would be typed by no reader of this site, and it is not what the
 * page shows.
 *
 * Names that are already searchable as standard fields -- the site's `en`/`de`
 * names and the scientific name -- are dropped from `seen`-seeded fold keys, so
 * a name is never scored twice and the payload stays as small as the behaviour
 * allows.
 */
function collectNames(wikidata: WikidataSpeciesData | undefined, seen: Set<string>): string[] {
  const out: string[] = []
  const add = (value: string): void => {
    const key = fold(value)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(value)
  }
  for (const c of wikidata?.names.commonNames ?? []) {
    if (c.lang === 'en' || c.lang === 'de' || c.lang === 'bar') add(c.value)
  }
  for (const lang of ['en', 'de'] as const) {
    for (const a of wikidata?.names.aliases?.[lang] ?? []) add(a)
  }
  return out
}

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
 * `wikidata` (the committed snapshots, keyed by QID) adds the common names and
 * aliases the page shows under "Common names" and "also known as". A species
 * without a QID -- or a QID whose snapshot has not been regenerated -- simply
 * emits an empty `names` array, which is a supported state.
 *
 * Sorted by slug so a rebuild that changes nothing produces a byte-identical
 * file -- `getCollection` order follows the loader and is not worth depending on.
 */
export function buildSearchIndex(
  entries: readonly SpeciesEntry[],
  wikidata?: WikidataByQid,
): SearchRecord[] {
  return entries
    .map((entry) => {
      const seen = new Set<string>(
        [entry.data.scientificName, entry.data.commonName.en, entry.data.commonName.de].map((v) =>
          fold(v),
        ),
      )
      return {
        slug: entry.id,
        scientific: entry.data.scientificName,
        en: entry.data.commonName.en,
        de: entry.data.commonName.de,
        names: collectNames(wikidata?.[entry.data.wikidataId ?? ''], seen),
      }
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))
}
