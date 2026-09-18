import type { CollectionEntry } from 'astro:content'
import type { RSSFeedItem } from '@astrojs/rss'
import type { Locale } from '../i18n'
import { getTranslations, formatDate, formatAnchorDate } from '../i18n'
import { buildLocationMap, locationName } from './sightings'

export type SpeciesEntry = CollectionEntry<'species'>
export type LocationEntry = CollectionEntry<'locations'>
export type BacklogEntry = CollectionEntry<'backlog'>
export type NewsEntry = CollectionEntry<'news'>

export interface NewsCollections {
  newsEntries: NewsEntry[]
  speciesEntries: SpeciesEntry[]
  locationEntries: LocationEntry[]
  backlogEntries: BacklogEntry[]
}

export interface BacklogBatch {
  photoDate: string
  count: number
  ids: string[]
}

export interface DayFeed {
  date: string
  backlogBatches: BacklogBatch[]
  identifiedCount: number | null
  newLocations: string[]
  newSpecies: string[]
}

export function siteBase(site: URL | string | undefined): string {
  return site ? String(site).replace(/\/$/, '') : 'http://localhost:4321'
}

export function itemsCount(n: number, locale: Locale): string {
  const t = getTranslations(locale)
  return `${n} ${n === 1 ? t.home.newsItem : t.home.newsItems}`
}

export function buildNewsFeed(collections: NewsCollections): DayFeed[] {
  const { newsEntries } = collections
  const byDate = new Map<string, DayFeed>()
  const ensure = (date: string): DayFeed => {
    let day = byDate.get(date)
    if (!day) {
      day = {
        date,
        backlogBatches: [],
        identifiedCount: null,
        newLocations: [],
        newSpecies: [],
      }
      byDate.set(date, day)
    }
    return day
  }

  for (const entry of newsEntries) {
    const day = ensure(entry.data.date)
    switch (entry.data.type) {
      case 'backlog-added': {
        const photoDate = entry.data.photoDate
        let batch = day.backlogBatches.find((b) => b.photoDate === photoDate)
        if (!batch) {
          batch = { photoDate, count: 0, ids: [] }
          day.backlogBatches.push(batch)
        }
        batch.count += entry.data.count
        if (entry.data.items) batch.ids.push(...entry.data.items)
        break
      }
      case 'identified':
        day.identifiedCount = (day.identifiedCount ?? 0) + entry.data.sightings.length
        break
      case 'new-species':
        day.newSpecies.push(...entry.data.slugs)
        break
      case 'new-location':
        day.newLocations.push(...entry.data.slugs)
        break
    }
  }

  for (const day of byDate.values()) {
    day.backlogBatches.sort((a, b) => a.photoDate.localeCompare(b.photoDate))
    for (const batch of day.backlogBatches) batch.ids.sort()
    day.newSpecies = [...new Set(day.newSpecies)].sort()
    day.newLocations = [...new Set(day.newLocations)].sort()
  }

  const feed = [...byDate.values()]
  feed.sort((a, b) => b.date.localeCompare(a.date))
  return feed
}

export function buildRssItems(
  locale: Locale,
  base: string,
  collections: NewsCollections,
): RSSFeedItem[] {
  const t = getTranslations(locale)
  const feed = buildNewsFeed(collections)
  const locations = buildLocationMap(collections.locationEntries)
  const speciesScientific = new Map(
    collections.speciesEntries.map((s) => [s.id, s.data.scientificName]),
  )
  const backlogIds = new Set(collections.backlogEntries.map((b) => b.id))
  const items: RSSFeedItem[] = []

  const push = (date: string, title: string, link: string) => {
    items.push({
      title,
      link: `${base}/${locale}${link}`,
      pubDate: new Date(`${date}T12:00:00`),
      description: `${title} — ${formatDate(date, locale)}`,
    })
  }

  for (const day of feed) {
    for (const batch of day.backlogBatches) {
      const title = `${itemsCount(batch.count, locale)} ${t.home.newsBacklogFrom} ${formatDate(batch.photoDate, locale)}`
      const link =
        batch.ids.length === 1 && backlogIds.has(batch.ids[0])
          ? `/backlog/${batch.ids[0]}`
          : `/backlog#${formatAnchorDate(batch.photoDate)}`
      push(day.date, title, link)
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
