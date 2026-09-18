import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { appendNewsEvent } from './news-events.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const CONTENT = path.join(ROOT, 'src', 'content')
const NEWS_DIR = path.join(CONTENT, 'news')
const SIGHTINGS_DIR = path.join(CONTENT, 'sightings')
const SPECIES_DIR = path.join(CONTENT, 'species')
const LOCATIONS_DIR = path.join(CONTENT, 'locations')

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

// First-add git commit + date per content path. Lives off --diff-filter=A so
// files that were later deleted (e.g. backlog items that were identified and
// removed) remain in the history.
function addDatesFor(subtree) {
  const out = git([
    'log',
    '--reverse',
    '--diff-filter=A',
    '--format=%H|%cI',
    '--name-only',
    '--',
    subtree,
  ])
  const map = new Map()
  let commit = null
  let date = null
  for (const line of out.split('\n')) {
    const m = line.match(/^([0-9a-f]{40})\|(\d{4}-\d{2}-\d{2})/)
    if (m) {
      commit = m[1]
      date = m[2]
    } else if (commit && date && line.startsWith(`${subtree}/`) && !map.has(line)) {
      map.set(line, { commit, date })
    }
  }
  return map
}

function gitFile(commit, path) {
  return git(['show', `${commit}:${path}`])
}

async function recordBacklogAdds() {
  const adds = addDatesFor('src/content/backlog')
  const byDay = new Map() // addDate -> Map(photoDate -> items[])
  for (const [file, { commit, date }] of adds) {
    const m = file.match(/^src\/content\/backlog\/([^/]+)\/index\.json$/)
    if (!m) continue
    const id = m[1]
    let photoDate
    try {
      photoDate = JSON.parse(gitFile(commit, file)).dateSpotted
    } catch {
      continue
    }
    if (!byDay.has(date)) byDay.set(date, new Map())
    const byPhoto = byDay.get(date)
    if (!byPhoto.has(photoDate)) byPhoto.set(photoDate, [])
    byPhoto.get(photoDate).push(id)
  }
  for (const date of [...byDay.keys()].sort()) {
    for (const photoDate of [...byDay.get(date).keys()].sort()) {
      const items = byDay.get(date).get(photoDate).sort()
      await appendNewsEvent({
        type: 'backlog-added',
        date,
        photoDate,
        count: items.length,
        items,
      })
    }
  }
}

async function recordIdentifications() {
  const byDate = new Map()
  for (const d of await fs.readdir(SIGHTINGS_DIR)) {
    const dateDir = path.join(SIGHTINGS_DIR, d)
    let stat
    try {
      stat = await fs.stat(dateDir)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    for (const slug of await fs.readdir(dateDir)) {
      try {
        const doc = JSON.parse(await fs.readFile(path.join(dateDir, slug, 'index.json'), 'utf8'))
        const date = doc.dateIdentified
        if (!date) continue
        if (!byDate.has(date)) byDate.set(date, [])
        byDate.get(date).push(`${d}/${slug}`)
      } catch {
        continue
      }
    }
  }
  for (const date of [...byDate.keys()].sort()) {
    await appendNewsEvent({
      type: 'identified',
      date,
      sightings: byDate.get(date).sort(),
    })
  }
}

async function recordContentAdds(subtree, type) {
  const adds = addDatesFor(subtree)
  const byDate = new Map()
  for (const file of await fs.readdir(path.join(ROOT, subtree))) {
    const add = adds.get(`${subtree}/${file}/index.json`)
    if (!add) continue
    const date = add.date
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push(file)
  }
  for (const date of [...byDate.keys()].sort()) {
    await appendNewsEvent({ type, date, slugs: byDate.get(date).sort() })
  }
}

await fs.rm(NEWS_DIR, { recursive: true, force: true })

await recordBacklogAdds()
await recordIdentifications()
await recordContentAdds('src/content/species', 'new-species')
await recordContentAdds('src/content/locations', 'new-location')

console.log('backfill complete')
