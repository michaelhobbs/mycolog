import type { CollectionEntry } from 'astro:content'
import type { RSSFeedItem } from '@astrojs/rss'
import type { Locale } from '../i18n'
import { getTranslations, formatDate } from '../i18n'
import { enrichSightings, identificationDate, buildLocationMap, locationName } from './sightings'
import type { EnrichedSighting } from './sightings'

export type SightingEntry = CollectionEntry<'sightings'>
export type SpeciesEntry = CollectionEntry<'species'>
export type LocationEntry = CollectionEntry<'locations'>

export interface NewsCollections {
  sightingEntries: SightingEntry[]
  speciesEntries: SpeciesEntry[]
  locationEntries: LocationEntry[]
}

export interface DayFeed {
  date: string
  spottedCount: number | null
  identifiedCount: number | null
  newLocations: string[]
  newSpecies: string[]
}

export function siteBase(site: URL | string | undefined): string {
  return site ? String(site).replace(/\/$/, '') : 'http://localhost:4321'
}

export function buildNewsFeed(sightings: EnrichedSighting[]): DayFeed[] {
  const byDate = new Map<string, DayFeed>()
  const ensure = (date: string): DayFeed => {
    let day = byDate.get(date)
    if (!day) {
      day = { date, spottedCount: null, identifiedCount: null, newLocations: [], newSpecies: [] }
      byDate.set(date, day)
    }
    return day
  }

  const locationFirst = new Map<string, string>()
  const speciesFirst = new Map<string, string>()

  for (const s of sightings) {
    const spotted = ensure(s.dateSpotted)
    spotted.spottedCount = (spotted.spottedCount ?? 0) + 1

    const day = ensure(identificationDate(s))
    day.identifiedCount = (day.identifiedCount ?? 0) + 1

    if (!locationFirst.has(s.locationSlug) || s.dateSpotted < locationFirst.get(s.locationSlug)!) {
      locationFirst.set(s.locationSlug, s.dateSpotted)
    }
    if (!speciesFirst.has(s.id) || s.dateSpotted < speciesFirst.get(s.id)!) {
      speciesFirst.set(s.id, s.dateSpotted)
    }
  }

  for (const [slug, date] of locationFirst) ensure(date).newLocations.push(slug)
  for (const [id, date] of speciesFirst) ensure(date).newSpecies.push(id)

  const feed = [...byDate.values()]
  for (const day of feed) {
    day.newLocations.sort()
    day.newSpecies.sort()
  }
  feed.sort((a, b) => b.date.localeCompare(a.date))
  return feed
}

export function buildRssItems(
  locale: Locale,
  base: string,
  collections: NewsCollections,
): RSSFeedItem[] {
  const t = getTranslations(locale)
  const sightings = enrichSightings(collections.sightingEntries, collections.speciesEntries)
  const feed = buildNewsFeed(sightings)
  const locations = buildLocationMap(collections.locationEntries)
  const speciesScientific = new Map(
    collections.speciesEntries.map((s) => [s.id, s.data.scientificName]),
  )
  const items: RSSFeedItem[] = []

  const push = (date: string, title: string, link: string) => {
    items.push({
      title,
      link: `${base}/${locale}${link}`,
      pubDate: new Date(`${date}T00:00:00Z`),
      description: `${title} — ${formatDate(date, locale)}`,
    })
  }

  for (const day of feed) {
    if (day.spottedCount !== null) {
      push(day.date, `${day.spottedCount} ${t.home.newsBacklogAdded}`, `/log/${day.date}`)
    }
    if (day.identifiedCount !== null) {
      push(
        day.date,
        `${day.identifiedCount} ${t.home.newsMushrooms} ${t.home.newsIdentifiedSuffix}`,
        `/identifications/${day.date}`,
      )
    }
    for (const slug of day.newLocations) {
      push(
        day.date,
        `${t.home.newsNewLocation}: ${locationName(locations, slug, locale)}`,
        `/locations/${slug}`,
      )
    }
    for (const id of day.newSpecies) {
      push(
        day.date,
        `${t.home.newsNewSpecies}: ${speciesScientific.get(id) ?? id}`,
        `/mushrooms/${id}`,
      )
    }
  }

  return items
}
