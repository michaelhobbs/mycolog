import { execSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { CollectionEntry } from 'astro:content'
import type { RSSFeedItem } from '@astrojs/rss'
import type { Locale } from '../i18n'
import { getTranslations, formatDate, formatAnchorDate } from '../i18n'
import { enrichSightings, identificationDate, buildLocationMap, locationName } from './sightings'

export type SightingEntry = CollectionEntry<'sightings'>
export type SpeciesEntry = CollectionEntry<'species'>
export type LocationEntry = CollectionEntry<'locations'>
export type BacklogEntry = CollectionEntry<'backlog'>

export interface NewsCollections {
  sightingEntries: SightingEntry[]
  speciesEntries: SpeciesEntry[]
  locationEntries: LocationEntry[]
  backlogEntries: BacklogEntry[]
}

export interface BacklogBatch {
  photoDate: string
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

const firstAddDates = new Map<string, string>()

function loadFirstAddDates(): Map<string, string> {
  if (firstAddDates.size > 0) return firstAddDates
  try {
    const out = execSync(
      'git log --reverse --diff-filter=A --format=%cI --name-only -- src/content',
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    )
    let date = ''
    for (const line of out.split('\n')) {
      if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
        date = line.slice(0, 10)
      } else if (date && line.startsWith('src/content/')) {
        if (!firstAddDates.has(line)) firstAddDates.set(line, date)
      }
    }
  } catch {
    return firstAddDates
  }
  return firstAddDates
}

function fileMtimeDate(collection: 'backlog' | 'species' | 'locations', id: string): string | null {
  try {
    const d = statSync(join(process.cwd(), 'src', 'content', collection, id, 'index.json')).mtime
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
  } catch {
    return null
  }
}

function fileAddDate(collection: 'backlog' | 'species' | 'locations', id: string): string | null {
  const path = `src/content/${collection}/${id}/index.json`
  const gitDate = loadFirstAddDates().get(path)
  if (gitDate) return gitDate
  return fileMtimeDate(collection, id)
}

export function itemsCount(n: number, locale: Locale): string {
  const t = getTranslations(locale)
  return `${n} ${n === 1 ? t.home.newsItem : t.home.newsItems}`
}

export function buildNewsFeed(collections: NewsCollections): DayFeed[] {
  const { sightingEntries, speciesEntries, locationEntries, backlogEntries } = collections
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

  const sightings = enrichSightings(sightingEntries, speciesEntries)
  for (const s of sightings) {
    const day = ensure(identificationDate(s))
    day.identifiedCount = (day.identifiedCount ?? 0) + 1
  }

  const batchesByDate = new Map<string, BacklogBatch[]>()
  for (const b of backlogEntries) {
    const feedDate = fileAddDate('backlog', b.id) ?? b.data.dateSpotted
    let batches = batchesByDate.get(feedDate)
    if (!batches) {
      batches = []
      batchesByDate.set(feedDate, batches)
    }
    const photoDate = b.data.dateSpotted
    const batch =
      batches.find((x) => x.photoDate === photoDate) ??
      (() => {
        const created = { photoDate, ids: [] }
        batches!.push(created)
        return created
      })()
    batch.ids.push(b.id)
  }
  for (const [date, batches] of batchesByDate) {
    batches.sort((a, b) => a.photoDate.localeCompare(b.photoDate))
    for (const batch of batches) batch.ids.sort()
    ensure(date).backlogBatches.push(...batches)
  }

  const speciesByDate = new Map<string, string[]>()
  for (const sp of speciesEntries) {
    const date = fileAddDate('species', sp.id)
    if (!date) continue
    if (!speciesByDate.has(date)) speciesByDate.set(date, [])
    speciesByDate.get(date)!.push(sp.id)
  }
  for (const [date, ids] of speciesByDate) {
    ids.sort()
    ensure(date).newSpecies.push(...ids)
  }

  const locationsByDate = new Map<string, string[]>()
  for (const loc of locationEntries) {
    const date = fileAddDate('locations', loc.id)
    if (!date) continue
    if (!locationsByDate.has(date)) locationsByDate.set(date, [])
    locationsByDate.get(date)!.push(loc.id)
  }
  for (const [date, ids] of locationsByDate) {
    ids.sort()
    ensure(date).newLocations.push(...ids)
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
      const title = `${itemsCount(batch.ids.length, locale)} ${t.home.newsBacklogFrom} ${formatDate(batch.photoDate, locale)}`
      const link =
        batch.ids.length === 1
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
