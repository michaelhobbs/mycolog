// The drill-down facet model shared by /map and /mushrooms.
//
// This module is deliberately free of any build-time import: it is imported by
// the filter component's bundled <script>, so pulling `speciesWikidata` (232 KB
// of snapshots) or a content collection in here would ship all of it to the
// browser. Value extraction and counting live in ./species-facets-build, which
// only ever runs at build time; this side sees the payload as plain data.
//
// A selection is a plain list of chosen values per property, and one rule
// decides everything: **an item has to carry every selected value.** There is no
// mode, no exclusion and no precedence to resolve, so a chip is a two-state
// toggle and the whole model is one `every()`.
//
// Two consequences worth stating rather than hiding:
//
//   - Selecting two mutually exclusive values in one property (gills *and*
//     pores) matches nothing. That is the honest reading of "carry all of
//     these", and it is not a silent dead end: every chip carries the count it
//     would produce, so the impossible one reads 0 in red *before* it is
//     clicked. Capping a property at one value would have hidden that, by
//     quietly destroying the reader's second click.
//   - "No data" is a real value (`NO_DATA`) rather than an implicit behaviour,
//     because Wikidata's coverage is partial -- `hymenium type` is on 31 of the
//     47 species, `edibility` on 34 -- so "unknown" is a state a reader has to
//     be able to select explicitly rather than one we pick for them. Selected
//     alongside a real value it is an unsatisfiable conjunction, like any
//     other, and reads as the 0 it is.

/** Facets carried by the species, from the per-species Wikidata snapshots. */
export const SPECIES_FACET_KEYS = [
  'hymeniumType',
  'capShape',
  'hymeniumAttachment',
  'stipeCharacter',
  'sporePrintColor',
  'ecologicalType',
  'edibility',
] as const

/** Facets carried by an individual sighting. */
export const SIGHTING_FACET_KEYS = ['location'] as const

export type SpeciesFacetKey = (typeof SPECIES_FACET_KEYS)[number]
export type SightingFacetKey = (typeof SIGHTING_FACET_KEYS)[number]
export type FacetKey = SpeciesFacetKey | SightingFacetKey

/** All facet keys, in the order the panel renders them. */
export const FACET_KEYS: readonly FacetKey[] = [...SPECIES_FACET_KEYS, ...SIGHTING_FACET_KEYS]

/**
 * The id standing for "Wikidata makes no claim here", rather than a real value.
 *
 * It is mutually exclusive with every real value, so `facetPasses` tests it
 * against "does this subject have any value at all" instead of membership.
 */
export const NO_DATA = '~'

/** A species' values per species-level facet, keyed by facet. */
export type SpeciesFacets = Partial<Record<SpeciesFacetKey, string[]>>

/** A selection is the chosen values of one property, or absent if none. */
export type Selection = Partial<Record<FacetKey, string[]>>

export interface FacetValueMeta {
  id: string
  label: string
  /** How many of the page's unit (species or sightings) carry this value. */
  count: number
  /** True for the synthetic `NO_DATA` value. */
  none: boolean
  /**
   * The tooltip source, baked in at build time for the handful of curated term
   * values. This is plain data -- never an import of the glossary module -- so
   * the browser script receives the two short strings and nothing else.
   */
  glossary?: { id: string; short: string }
}

export interface FacetMeta {
  key: FacetKey
  label: string
  /** Ordered by count, then label. */
  values: FacetValueMeta[]
}

/** One sighting as `[id, speciesSlug, locationSlug]`. */
export type SightingRow = [string, string, string]

export interface FilterPayload {
  /**
   * What this page filters: a species card on /mushrooms, a marker on /map.
   * Chip counts are expressed in this unit, so the same facet reads truthfully
   * on both pages ("gills (31)" is 31 species, "gills (68)" is 68 markers).
   */
  unit: 'species' | 'sighting'
  facets: FacetMeta[]
  /** Every species on the page, even those with no data at all: they are what
   *  the "no data" value counts, so dropping them would hide the gap. */
  species: Record<string, SpeciesFacets>
  sightings: SightingRow[]
}

export function isFacetKey(key: string): key is FacetKey {
  return (FACET_KEYS as readonly string[]).includes(key)
}

/**
 * Does one subject carry every value selected for this property?
 *
 * An empty selection passes everything, so no filter is a filter that keeps all
 * of it.
 *
 * An empty `values` is the `NO_DATA` state rather than an empty set to match
 * against: selecting `NO_DATA` is how a reader asks for the species Wikidata
 * says nothing about, which nothing else can reach.
 */
export function facetPasses(
  values: string[] | undefined,
  selected: readonly string[] | undefined,
): boolean {
  if (!selected || selected.length === 0) return true
  const has = new Set(values ?? [])
  const none = has.size === 0
  return selected.every((v) => (v === NO_DATA ? none : has.has(v)))
}

/** Every species-level property must pass. Location is not a species attribute. */
export function matchesSpecies(facets: SpeciesFacets | undefined, sel: Selection): boolean {
  for (const key of SPECIES_FACET_KEYS) {
    if (!facetPasses(facets?.[key], sel[key])) return false
  }
  return true
}

/**
 * Does a sighting survive? Its species has to pass every species-level property,
 * and the sighting's own location has to pass the location property.
 *
 * That second half is why location cannot be folded into the species map: 16 of
 * the 47 species are sighted at more than one place, so filtering a map marker
 * by "Eibsee" has to test the sighting, not the species.
 */
export function matchesSighting(
  row: SightingRow,
  speciesFacets: SpeciesFacets | undefined,
  sel: Selection,
): boolean {
  if (!matchesSpecies(speciesFacets, sel)) return false
  const [, , locationSlug] = row
  return facetPasses(locationSlug ? [locationSlug] : [], sel.location)
}

/**
 * Serialise a selection into the one `f` query parameter.
 *
 * `key:value,other;key2:value` -- `,` between values, `;` between properties,
 * and `~` for `NO_DATA`. All three are characters that cannot occur in a QID or
 * a content slug, so the grammar needs no escaping and round-trips through
 * `URLSearchParams` unchanged.
 */
export function encodeSelection(sel: Selection): string {
  const clauses: string[] = []
  for (const key of FACET_KEYS) {
    const tokens = dedupe(sel[key] ?? [])
    if (tokens.length > 0) clauses.push(`${key}:${tokens.join(',')}`)
  }
  return clauses.join(';')
}

/**
 * Parse the `f` parameter, ignoring anything unrecognised.
 *
 * A hand-edited or truncated URL must not be able to throw: an unknown property
 * key is dropped, and a selection that ends up empty is the same as no selection
 * at all.
 *
 * A `!value` token is a *stale exclusion* from the grammar this filter used
 * before it became drill-down-only, and it is **discarded rather than read as an
 * include**. Reinterpreting it would silently mean the opposite of what the link
 * said -- a shared "not poisonous" link would become "only poisonous" -- so the
 * worst outcome of an old link is a filter that is not applied.
 */
export function decodeSelection(raw: string | null | undefined): Selection {
  const sel: Selection = {}
  if (!raw) return sel
  for (const clause of raw.split(';')) {
    const sep = clause.indexOf(':')
    if (sep < 1) continue
    const key = clause.slice(0, sep)
    if (!isFacetKey(key)) continue
    const values = dedupe(clause.slice(sep + 1).split(',')).filter((v) => !v.startsWith('!'))
    if (values.length > 0) sel[key] = values
  }
  return sel
}

export function selectionIsEmpty(sel: Selection): boolean {
  return FACET_KEYS.every((key) => (sel[key]?.length ?? 0) === 0)
}

/** Two-state toggle: add the value, or take it back out. */
export function toggleValue(list: string[], value: string): string[] {
  const at = list.indexOf(value)
  if (at < 0) return [...list, value]
  return list.filter((_, i) => i !== at)
}

/**
 * The selection as it would be with `value` added -- the "what would I get if I
 * clicked this?" state a chip count reports.
 */
export function withIncluded(sel: Selection, key: FacetKey, value: string): Selection {
  return { ...sel, [key]: dedupe([...(sel[key] ?? []), value]) }
}

/**
 * How many units of the page survive if `value` were selected on top of `sel`.
 *
 * This is what makes a chip count honest: with nothing selected it degenerates
 * to the value's static total, and every click narrows all 71 of them to the
 * question you are actually asking -- "if I add this one, how many are left?".
 *
 * The unit is the page's own, so a species is counted when *any* of its
 * sightings survives, exactly as `apply()` decides visibility. Counting sighting
 * rows instead would let a species with 5 sightings outnumber one with 1, which
 * is the wrong unit for the index.
 *
 * A value already selected is left alone, so the chip you just clicked does not
 * change its own number under your cursor.
 */
export function countWithValue(
  payload: FilterPayload,
  sel: Selection,
  key: FacetKey,
  value: string,
): number {
  if (sel[key]?.includes(value)) return countSurvivors(payload, sel).matched
  return countSurvivors(payload, withIncluded(sel, key, value)).matched
}

export interface SurvivorCounts {
  /** Units surviving the current selection. */
  matched: number
  /** Units on the page. */
  total: number
  /** Survivors per species slug, for card visibility and the per-card count. */
  perSpecies: Map<string, number>
  /**
   * Surviving sighting ids. The map republishes exactly these, so the count and
   * the published set come out of one pass rather than two that could disagree.
   */
  sightingIds: Set<string>
}

/** One pass over the sightings: survivors in the page's unit, plus per-species. */
export function countSurvivors(payload: FilterPayload, sel: Selection): SurvivorCounts {
  const perSpecies = new Map<string, number>()
  const sightingIds = new Set<string>()
  for (const row of payload.sightings) {
    if (!matchesSighting(row, payload.species[row[1]], sel)) continue
    sightingIds.add(row[0])
    perSpecies.set(row[1], (perSpecies.get(row[1]) ?? 0) + 1)
  }
  // On the index a species is the unit, and it survives if any sighting does --
  // so 5 sightings must not count as 5.
  const matched = payload.unit === 'species' ? perSpecies.size : sightingIds.size
  const total =
    payload.unit === 'species' ? Object.keys(payload.species).length : payload.sightings.length
  return { matched, total, perSpecies, sightingIds }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}
