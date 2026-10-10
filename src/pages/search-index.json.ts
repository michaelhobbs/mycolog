import { getCollection } from 'astro:content'
import { speciesWikidata } from '../data/wikidata/species'
import { buildSearchIndex } from '../lib/search-index-build'

/**
 * The header search's index, emitted once at build time.
 *
 * Deliberately **not** inlined into `Layout.astro`: the search ships on every
 * built page, so baking the payload into the header would add it to the large
 * majority of pages where nobody searches -- most of all the backlog day pages,
 * which already carry the day listing. `SiteSearch` fetches this on first focus
 * instead, so the cost is one small gzipped request for the sessions that use it
 * and nothing at all for the rest.
 *
 * Not localized: every record carries both locale names and the client already
 * knows the locale it is rendering, so one file serves every locale and stays
 * cached when the reader switches between them.
 */
export async function GET() {
  const species = await getCollection('species')
  return new Response(JSON.stringify(buildSearchIndex(species, speciesWikidata)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
