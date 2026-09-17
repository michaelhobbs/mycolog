import type { CollectionEntry } from 'astro:content'
import type { Locale } from '../i18n'
import { l10n } from '../i18n/helpers'

export type SpeciesEntry = CollectionEntry<'species'>
export type SightingEntry = CollectionEntry<'sightings'>
export type LocationEntry = CollectionEntry<'locations'>
export type LocationMap = Map<string, LocationEntry['data']>

export interface EnrichedSighting {
  id: string
  slug: string
  authors: string[]
  dateSpotted: string
  dateIdentified: string
  locationSlug: string
  location: SightingEntry['data']['location']
  images: SightingEntry['data']['images']
  notes: SightingEntry['data']['notes']
  species: SpeciesEntry['data']
}

export function identificationDate(s: EnrichedSighting): string {
  return s.dateIdentified || s.dateSpotted
}

export function buildSpeciesMap(species: SpeciesEntry[]): Map<string, SpeciesEntry['data']> {
  return new Map(species.map((s) => [s.id, s.data]))
}

export function buildLocationMap(locations: LocationEntry[]): LocationMap {
  return new Map(locations.map((l) => [l.id, l.data]))
}

export function locationName(locations: LocationMap, slug: string, locale: Locale): string {
  return l10n(locations.get(slug)?.name, locale) || slug
}

export function enrichSighting(
  sighting: SightingEntry,
  speciesMap: Map<string, SpeciesEntry['data']>,
): EnrichedSighting {
  const speciesData = speciesMap.get(sighting.data.species)
  return {
    id: sighting.data.species,
    slug: sighting.id,
    authors: sighting.data.authors,
    dateSpotted: sighting.data.dateSpotted,
    dateIdentified: sighting.data.dateIdentified || sighting.data.dateSpotted,
    locationSlug: sighting.data.locationSlug,
    location: sighting.data.location,
    images: sighting.data.images,
    notes: sighting.data.notes,
    species: speciesData ?? {
      scientificName: sighting.data.species,
      commonName: { en: sighting.data.species, de: sighting.data.species },
      determiningFeatures: [],
    },
  }
}

export function enrichSightings(
  sightings: SightingEntry[],
  species: SpeciesEntry[],
): EnrichedSighting[] {
  const speciesMap = buildSpeciesMap(species)
  return sightings.map((s) => enrichSighting(s, speciesMap))
}
