// Build-time half of the facet model: turns the content collections into the
// plain payload the filter's browser script matches against.
//
// This is the ONLY side that may touch `speciesWikidata` (232 KB of snapshots)
// or a content collection, because ./species-facets is imported by that script
// and would drag both into the client bundle. See that module for the matching
// rules.

import type { CollectionEntry } from 'astro:content'
import { speciesWikidata } from '../data/wikidata/species'
import type { ItemRef, WikidataSpeciesData } from '../data/wikidata/species/types'
import { getTranslations } from '../i18n'
import { l10n } from '../i18n/helpers'
import type { Locale } from '../i18n'
import en from '../i18n/en'
import { FACET_KEYS, NO_DATA, SPECIES_FACET_KEYS } from './species-facets'
import type {
  FacetKey,
  FacetMeta,
  FacetValueMeta,
  FilterPayload,
  SightingRow,
  SpeciesFacets,
  SpeciesFacetKey,
} from './species-facets'

// Facet names reuse the species page's own wording, so a label can never say
// "Attachment" here and "Ansetzung" nowhere. Typed against `en` as const so a
// renamed or misspelt key is a compile error rather than an `undefined` heading.
const FACET_LABEL: Record<FacetKey, keyof typeof en.mushrooms> = {
  hymeniumType: 'hymeniumType',
  capShape: 'capShape',
  hymeniumAttachment: 'hymeniumAttachment',
  stipeCharacter: 'stipeCharacter',
  sporePrintColor: 'sporePrintColor',
  ecologicalType: 'ecologicalType',
  edibility: 'edibility',
  location: 'location',
}

/**
 * The species-level values of one snapshot, as bare ids.
 *
 * Four of the seven properties are single-valued `ItemRef`s and three are
 * arrays, and `edibility` is always an array that may be empty -- see
 * `MorphologyData`/`EdibilityData`. Mirrors how SpeciesData.astro reads them, so
 * a value shown on a species page is a value the filter can match on.
 */
export function speciesFacetValues(
  snapshot: WikidataSpeciesData | undefined,
  key: SpeciesFacetKey,
): string[] {
  if (!snapshot) return []
  const morphology = snapshot.morphology
  switch (key) {
    case 'hymeniumType':
      return morphology.hymeniumType ? [morphology.hymeniumType.qid] : []
    case 'capShape':
      return (morphology.capShape ?? []).map((r) => r.qid)
    case 'hymeniumAttachment':
      return morphology.hymeniumAttachment ? [morphology.hymeniumAttachment.qid] : []
    case 'stipeCharacter':
      return morphology.stipeCharacter ? [morphology.stipeCharacter.qid] : []
    case 'sporePrintColor':
      return morphology.sporePrintColor ? [morphology.sporePrintColor.qid] : []
    case 'ecologicalType':
      return (snapshot.ecology.ecologicalType ?? []).map((r) => r.qid)
    case 'edibility':
      return snapshot.edibility.values.map((r) => r.qid)
  }
}

function extractFacets(snapshot: WikidataSpeciesData | undefined): SpeciesFacets {
  const out: SpeciesFacets = {}
  for (const key of SPECIES_FACET_KEYS) {
    const values = speciesFacetValues(snapshot, key)
    // Keep the key even when empty: an absent entry and an empty array both mean
    // "no data" to `facetPasses`, but only if the reader cannot tell them apart.
    out[key] = values
  }
  return out
}

type ValueLabel = Partial<Record<'en' | 'de', string>>

/**
 * Union the labels of every value across every snapshot.
 *
 * A value's `ItemRef` is repeated wherever Wikidata attaches it, so the labels
 * are collected once here and reused by every species that has the value. Later
 * entries never overwrite an earlier translation, which keeps the labels
 * deterministic regardless of snapshot order.
 */
function collectValueLabels(
  snapshots: (WikidataSpeciesData | undefined)[],
): Map<string, ValueLabel> {
  const labels = new Map<string, ValueLabel>()
  const add = (ref: ItemRef) => {
    const existing = labels.get(ref.qid) ?? {}
    labels.set(ref.qid, { en: existing.en ?? ref.labels.en, de: existing.de ?? ref.labels.de })
  }
  for (const snapshot of snapshots) {
    if (!snapshot) continue
    const morphology = snapshot.morphology
    if (morphology.hymeniumType) add(morphology.hymeniumType)
    for (const r of morphology.capShape ?? []) add(r)
    if (morphology.hymeniumAttachment) add(morphology.hymeniumAttachment)
    if (morphology.stipeCharacter) add(morphology.stipeCharacter)
    if (morphology.sporePrintColor) add(morphology.sporePrintColor)
    for (const r of snapshot.ecology.ecologicalType ?? []) add(r)
    for (const r of snapshot.edibility.values) add(r)
  }
  return labels
}

export interface FilterSource {
  species: CollectionEntry<'species'>[]
  sightings: CollectionEntry<'sightings'>[]
  locations: CollectionEntry<'locations'>[]
  locale: Locale
  /**
   * What the page filters. Chip counts are counted in this unit so the same
   * facet reads truthfully on both pages -- see `FilterPayload['unit']`.
   */
  unit: 'species' | 'sighting'
}

export function buildFilterPayload(source: FilterSource): FilterPayload {
  const { species, sightings, locations, locale, unit } = source
  const t = getTranslations(locale)

  const snapshotOf = new Map<string, WikidataSpeciesData | undefined>()
  for (const entry of species) {
    // `wikidataId` is optional in the schema, so the lookup can legitimately miss.
    snapshotOf.set(
      entry.id,
      entry.data.wikidataId ? speciesWikidata[entry.data.wikidataId] : undefined,
    )
  }

  const valueLabels = collectValueLabels([...snapshotOf.values()])
  const nameOfLocation = new Map(locations.map((l) => [l.id, l10n(l.data.name, locale) || l.id]))

  const facetsOf = new Map<string, SpeciesFacets>()
  for (const entry of species) facetsOf.set(entry.id, extractFacets(snapshotOf.get(entry.id)))

  const rows: SightingRow[] = sightings.map((s) => [
    s.id,
    s.data.species,
    s.data.locationSlug ?? '',
  ])

  // A species is at a location if any of its sightings is, which is what the
  // location facet means on /mushrooms. /map never reads this -- it tests each
  // sighting's own location instead, so one marker cannot drag in its siblings.
  const locationsOfSpecies = new Map<string, string[]>()
  for (const [, speciesSlug, locationSlug] of rows) {
    const list = locationsOfSpecies.get(speciesSlug)
    if (list) list.push(locationSlug)
    else locationsOfSpecies.set(speciesSlug, [locationSlug])
  }

  const counts = new Map<FacetKey, Map<string, number>>()
  const bump = (facet: FacetKey, values: string[]) => {
    let tally = counts.get(facet)
    if (!tally) {
      tally = new Map()
      counts.set(facet, tally)
    }
    // An empty list is the `NO_DATA` bucket, counted rather than skipped.
    const keys = values.length > 0 ? [...new Set(values)] : [NO_DATA]
    for (const key of keys) tally.set(key, (tally.get(key) ?? 0) + 1)
  }

  if (unit === 'species') {
    for (const entry of species) {
      const values = facetsOf.get(entry.id) ?? {}
      for (const key of SPECIES_FACET_KEYS) bump(key, values[key] ?? [])
      bump('location', locationsOfSpecies.get(entry.id) ?? [])
    }
  } else {
    for (const [, speciesSlug, locationSlug] of rows) {
      const values = facetsOf.get(speciesSlug) ?? {}
      for (const key of SPECIES_FACET_KEYS) bump(key, values[key] ?? [])
      bump('location', [locationSlug])
    }
  }

  const facets: FacetMeta[] = []
  for (const key of FACET_KEYS) {
    const tally = counts.get(key)
    // A facet nobody has a value for is not offered: the location facet has no
    // `NO_DATA` chip today because every sighting carries a locationSlug, and an
    // empty bucket would be a control that can only ever match zero.
    if (!tally || tally.size === 0) continue
    const values: FacetValueMeta[] = [...tally.entries()].map(([id, count]) => ({
      id,
      count,
      none: id === NO_DATA,
      label:
        id === NO_DATA
          ? t.mushrooms.noData
          : key === 'location'
            ? (nameOfLocation.get(id) ?? id)
            : labelOfValue(valueLabels.get(id), locale, id),
    }))
    // Count descending, so the common values lead; but the `NO_DATA` bucket goes
    // last regardless -- it is the largest in most facets, and leading every
    // facet with "not recorded" would read as the site's main subject.
    values.sort(
      (a, b) =>
        Number(a.none) - Number(b.none) ||
        b.count - a.count ||
        a.label.localeCompare(b.label, locale),
    )
    facets.push({ key, label: t.mushrooms[FACET_LABEL[key]], values })
  }

  return {
    unit,
    facets,
    species: Object.fromEntries(facetsOf),
    sightings: rows,
  }
}

/** Same fallback chain as SpeciesData.astro's `labelOf`, so a value is never blank. */
function labelOfValue(label: ValueLabel | undefined, locale: Locale, fallback: string): string {
  return label?.[locale] ?? label?.en ?? label?.de ?? fallback
}
