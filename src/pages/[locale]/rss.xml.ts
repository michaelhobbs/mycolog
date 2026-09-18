import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import type { APIContext } from 'astro'
import { getTranslations, locales } from '../../i18n'
import type { Locale } from '../../i18n'
import { buildRssItems, siteBase } from '../../lib/news'
import type { NewsCollections } from '../../lib/news'

export function getStaticPaths() {
  return locales.map((locale) => ({ params: { locale } }))
}

export async function GET(context: APIContext) {
  const locale = (context.params.locale ?? 'en') as Locale
  const t = getTranslations(locale)
  const base = siteBase(context.site)

  const [newsEntries, speciesEntries, locationEntries, backlogEntries] = await Promise.all([
    getCollection('news'),
    getCollection('species'),
    getCollection('locations'),
    getCollection('backlog'),
  ])
  const collections: NewsCollections = {
    newsEntries,
    speciesEntries,
    locationEntries,
    backlogEntries,
  }

  return rss({
    title: `${t.home.newsTitle} — myco.log`,
    description: t.home.heroDescription,
    site: base,
    items: buildRssItems(locale, base, collections),
  })
}
