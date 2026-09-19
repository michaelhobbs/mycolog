import express from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { format } from 'prettier'
import { appendNewsEvent } from './news-events.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CONTENT = path.join(ROOT, 'src', 'content')
const BACKLOG_DIR = path.join(CONTENT, 'backlog')
const SIGHTINGS_DIR = path.join(CONTENT, 'sightings')
const SPECIES_DIR = path.join(CONTENT, 'species')
const AUTHORS_DIR = path.join(CONTENT, 'authors')
const LOCATIONS_DIR = path.join(CONTENT, 'locations')

const PORT = Number(process.env.PORT || 4322)

const app = express()
app.use(express.json())

function slugify(s = '') {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base, dir) {
  let candidate = base || 'new-species'
  let i = 2
  while (true) {
    try {
      await fs.access(path.join(dir, candidate))
    } catch {
      return candidate
    }
    candidate = `${base}-${i}`
    i++
  }
}

// Write content JSON formatted to the repo's Prettier rules (the pre-commit
// hook checks format, incl. single-element arrays kept inline).
async function writeJson(file, doc) {
  const text = await format(JSON.stringify(doc, null, 2) + '\n', {
    parser: 'json',
    semi: false,
    printWidth: 100,
  })
  await fs.writeFile(file, text)
}

// Create (if missing) a content entry for an author name and return its slug.
async function ensureAuthor(name) {
  const slug = slugify(name) || 'unknown'
  const file = path.join(AUTHORS_DIR, slug, 'index.json')
  try {
    await fs.access(file)
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify({ name }, null, 2) + '\n')
  }
  return slug
}

// Create (if missing) a content entry for a location name. Returns the slug
// and whether the entry was created by this call.
async function ensureLocation(name, lat, lng) {
  const slug = slugify(name) || 'unknown-area'
  const file = path.join(LOCATIONS_DIR, slug, 'index.json')
  try {
    await fs.access(file)
  } catch {
    const doc = {
      name: { en: name, de: name },
      center: { lat, lng },
    }
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(doc, null, 2) + '\n')
    return { slug, created: true }
  }
  return { slug, created: false }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/sightings', async (req, res) => {
  const {
    dateSpotted,
    location,
    species,
    newSpecies,
    backlogId,
    locationName,
    notes,
    extraAuthors,
    newAuthors,
  } = req.body || {}

  try {
    // 1. Validate core fields
    if (!dateSpotted || !/^\d{4}-\d{2}-\d{2}$/.test(dateSpotted)) {
      return res.status(400).json({ error: 'Invalid dateSpotted' })
    }
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return res.status(400).json({ error: 'Invalid location' })
    }
    if (!species && !newSpecies) {
      return res.status(400).json({ error: 'Missing species' })
    }
    if (!backlogId) {
      return res.status(400).json({ error: 'Missing backlogId' })
    }

    // 2. Find the backlog entry (images + metadata)
    const backlogEntryDir = path.join(BACKLOG_DIR, String(backlogId))
    let backlogImages = []
    let backlogMeta = null
    try {
      const imagesDir = path.join(backlogEntryDir, 'images')
      const files = (await fs.readdir(imagesDir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
      backlogImages = files.map((f) => ({ from: path.join(imagesDir, f), name: f }))
      backlogMeta = JSON.parse(await fs.readFile(path.join(backlogEntryDir, 'index.json'), 'utf8'))
    } catch {
      return res.status(404).json({ error: `Backlog entry not found: ${backlogId}` })
    }
    if (!backlogImages.length) {
      return res.status(404).json({ error: `No images in backlog entry ${backlogId}` })
    }

    // Order the photos by the backlog's images array (what the gallery shows),
    // falling back to the on-disk sort if the files don't line up.
    let orderedImages = backlogImages
    if (Array.isArray(backlogMeta?.images)) {
      const byBase = new Map(backlogImages.map((f) => [path.basename(f.name).toLowerCase(), f]))
      const arr = []
      for (const rel of backlogMeta.images) {
        const base = path.basename(String(rel).split('?')[0]).toLowerCase()
        const f = byBase.get(base)
        if (f) arr.push(f)
      }
      if (arr.length === backlogImages.length) orderedImages = arr
    }

    // The sighting's first photo is used as its cover; honour the main photo
    // chosen on the backlog item by moving that photo to the front.
    const coverIdx = Number.isInteger(backlogMeta?.cover) ? backlogMeta.cover : 0
    const pickedImages = [...orderedImages]
    if (coverIdx > 0 && coverIdx < pickedImages.length) {
      const [chosen] = pickedImages.splice(coverIdx, 1)
      pickedImages.unshift(chosen)
    }

    // Backlog authors (from import) + any selected/new authors supplied by the form.
    const backlogAuthors = Array.isArray(backlogMeta?.authors)
      ? backlogMeta.authors.filter((a) => typeof a === 'string')
      : []
    const chosenExtras = Array.isArray(extraAuthors)
      ? extraAuthors.filter((a) => typeof a === 'string')
      : []
    const chosenNews = []
    if (Array.isArray(newAuthors)) {
      for (const name of newAuthors) {
        if (typeof name !== 'string' || !name.trim()) continue
        chosenNews.push(await ensureAuthor(name.trim()))
      }
    }
    const authors = [...new Set([...backlogAuthors, ...chosenExtras, ...chosenNews])]

    // 3. Resolve / create species slug
    let speciesSlug = species
    if (newSpecies) {
      const sci = newSpecies.scientificName || ''
      if (!sci) return res.status(400).json({ error: 'New species needs a scientific name' })
      const en = newSpecies.commonName?.en || ''
      const de = newSpecies.commonName?.de || ''
      speciesSlug = await uniqueSlug(slugify(sci) || 'new-species', SPECIES_DIR)
      await fs.mkdir(path.join(SPECIES_DIR, speciesSlug), { recursive: true })
      const speciesDoc = {
        scientificName: sci,
        commonName: { en, de },
        determiningFeatures: [],
      }
      await fs.writeFile(
        path.join(SPECIES_DIR, speciesSlug, 'index.json'),
        JSON.stringify(speciesDoc, null, 2) + '\n',
      )
    }

    // 4. Create the sighting entry (+ copy images)
    const dateDir = path.join(SIGHTINGS_DIR, dateSpotted)
    const sightingSlug = await uniqueSlug(speciesSlug, dateDir)
    const sightingDir = path.join(dateDir, sightingSlug)
    const imagesDir = path.join(sightingDir, 'images')
    await fs.mkdir(imagesDir, { recursive: true })

    const imagePaths = []
    for (let i = 0; i < pickedImages.length; i++) {
      const ext = path.extname(pickedImages[i].name).toLowerCase()
      const newName = `${speciesSlug}${i + 1}${ext}`
      await fs.copyFile(pickedImages[i].from, path.join(imagesDir, newName))
      imagePaths.push(`./images/${newName}`)
    }

    const sightingLocation = {
      lat: location.lat,
      lng: location.lng,
    }

    let locationSlug = null
    let createdNewLocation = false
    if (locationName && typeof locationName === 'string' && locationName.trim()) {
      const loc = await ensureLocation(locationName.trim(), location.lat, location.lng)
      locationSlug = loc.slug
      createdNewLocation = loc.created
    }

    const sightingDoc = {
      species: speciesSlug,
      locationSlug,
      authors,
      dateSpotted,
      dateIdentified: new Date().toISOString().slice(0, 10),
      location: sightingLocation,
      images: imagePaths,
    }

    const notesEn = notes?.en && String(notes.en).trim()
    const notesDe = notes?.de && String(notes.de).trim()
    if (notesEn || notesDe) {
      sightingDoc.notes = { en: notesEn || '', de: notesDe || '' }
    }

    await fs.writeFile(
      path.join(sightingDir, 'index.json'),
      JSON.stringify(sightingDoc, null, 2) + '\n',
    )

    // 5. Remove the backlog entry
    await fs.rm(backlogEntryDir, { recursive: true, force: true })

    // 6. Record declarative news events
    const today = new Date().toISOString().slice(0, 10)
    await appendNewsEvent({
      type: 'identified',
      date: today,
      sightings: [`${dateSpotted}/${sightingSlug}`],
    })
    if (newSpecies && speciesSlug) {
      await appendNewsEvent({ type: 'new-species', date: today, slugs: [speciesSlug] })
    }
    if (createdNewLocation) {
      await appendNewsEvent({ type: 'new-location', date: today, slugs: [locationSlug] })
    }

    return res.json({
      ok: true,
      species: speciesSlug,
      sighting: `${dateSpotted}/${sightingSlug}`,
      createdNewSpecies: Boolean(newSpecies),
    })
  } catch (err) {
    console.error('[api] error:', err)
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/sightings/cover', async (req, res) => {
  const { date, slug, image } = req.body || {}

  try {
    // The main photo is simply images[0]; the map popup and the log both use
    // the first image as the cover. This endpoint moves a photo to the front.
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date' })
    }
    if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Invalid slug' })
    }
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Invalid image' })
    }

    const dir = path.join(SIGHTINGS_DIR, date, slug)
    const file = path.join(dir, 'index.json')
    let doc
    try {
      doc = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      return res.status(404).json({ error: `Sighting not found: ${date}/${slug}` })
    }

    const images = Array.isArray(doc.images) ? doc.images.filter((x) => typeof x === 'string') : []
    // The frontend sends the resolved ImageMetadata src (e.g. a dev-mode
    // /@fs/.../images/xxx.jpg?origWidth=... URL). Match on the bare filename.
    const targetBase = path.basename(String(image).split('?')[0]).toLowerCase()
    const idx = images.findIndex((rel) => path.basename(rel).toLowerCase() === targetBase)
    if (idx === -1) {
      return res.status(400).json({ error: 'Image is not part of this sighting' })
    }
    if (idx === 0) {
      return res.json({ ok: true, images })
    }

    const [chosen] = images.splice(idx, 1)
    images.unshift(chosen)
    doc.images = images

    await fs.writeFile(file, JSON.stringify(doc, null, 2) + '\n')
    return res.json({ ok: true, images })
  } catch (err) {
    console.error('[api] error:', err)
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/species/:slug/cover', async (req, res) => {
  const slug = String(req.params?.slug || '')
  const { sighting, index } = req.body || {}

  try {
    // Species don't own images; the main photo is a reference to one image of a
    // sighting of that species ({ sighting: "date/slug", index }). The species
    // index page falls back to the first sighting's first image if unset.
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Invalid species slug' })
    }
    if (typeof sighting !== 'string' || !/^\d{4}-\d{2}-\d{2}\/[a-z0-9-]+$/.test(sighting)) {
      return res.status(400).json({ error: 'Invalid sighting reference' })
    }
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: 'Invalid image index' })
    }

    const file = path.join(SPECIES_DIR, slug, 'index.json')
    let doc
    try {
      doc = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      return res.status(404).json({ error: `Species not found: ${slug}` })
    }

    const [date, sslug] = sighting.split('/')
    const sightingFile = path.join(SIGHTINGS_DIR, date, sslug, 'index.json')
    let sdoc
    try {
      sdoc = JSON.parse(await fs.readFile(sightingFile, 'utf8'))
    } catch {
      return res.status(404).json({ error: `Sighting not found: ${sighting}` })
    }
    if (sdoc.species !== slug) {
      return res.status(400).json({ error: 'Image is not part of this species' })
    }
    const images = Array.isArray(sdoc.images)
      ? sdoc.images.filter((x) => typeof x === 'string')
      : []
    if (!images[index]) {
      return res.status(400).json({ error: 'Image index out of range' })
    }

    doc.cover = { sighting, index }
    await writeJson(file, doc)
    return res.json({ ok: true, cover: doc.cover })
  } catch (err) {
    console.error('[api] error:', err)
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/backlog/:id/location', async (req, res) => {
  const id = String(req.params?.id || '')
  const { location } = req.body || {}

  try {
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid backlog id' })
    }
    if (location !== null && (typeof location !== 'object' || location === null)) {
      return res.status(400).json({ error: 'Invalid location' })
    }
    if (location) {
      if (
        typeof location.lat !== 'number' ||
        typeof location.lng !== 'number' ||
        !Number.isFinite(location.lat) ||
        !Number.isFinite(location.lng) ||
        location.lat < -90 ||
        location.lat > 90 ||
        location.lng < -180 ||
        location.lng > 180
      ) {
        return res.status(400).json({ error: 'Invalid lat/lng' })
      }
    }

    const entryDir = path.join(BACKLOG_DIR, id)
    const file = path.join(entryDir, 'index.json')
    let doc
    try {
      doc = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      return res.status(404).json({ error: `Backlog entry not found: ${id}` })
    }

    if (location) {
      doc.location = { lat: location.lat, lng: location.lng }
    } else {
      delete doc.location
    }

    await writeJson(file, doc)
    return res.json({ ok: true, location: doc.location ?? null })
  } catch (err) {
    console.error('[api] error:', err)
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/backlog/:id/notes', async (req, res) => {
  const id = String(req.params?.id || '')
  const { notes } = req.body || {}

  try {
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid backlog id' })
    }
    if (notes !== null && (typeof notes !== 'object' || notes === null || Array.isArray(notes))) {
      return res.status(400).json({ error: 'Invalid notes' })
    }
    if (notes) {
      for (const key of ['en', 'de']) {
        if (key in notes && typeof notes[key] !== 'string') {
          return res.status(400).json({ error: `Invalid ${key} note` })
        }
      }
    }

    const entryDir = path.join(BACKLOG_DIR, id)
    const file = path.join(entryDir, 'index.json')
    let doc
    try {
      doc = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      return res.status(404).json({ error: `Backlog entry not found: ${id}` })
    }

    const notesEn = notes?.en ? String(notes.en).trim() : ''
    const notesDe = notes?.de ? String(notes.de).trim() : ''
    if (notesEn || notesDe) {
      doc.notes = { en: notesEn, de: notesDe }
    } else {
      delete doc.notes
    }

    await writeJson(file, doc)
    return res.json({ ok: true, notes: doc.notes ?? null })
  } catch (err) {
    console.error('[api] error:', err)
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/backlog/:id/cover', async (req, res) => {
  const id = String(req.params?.id || '')
  const { image } = req.body || {}

  try {
    // The main photo is simply the image that ends up first in the promoted
    // sighting; its position is the index into the backlog's images array.
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid backlog id' })
    }
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Invalid image' })
    }

    const entryDir = path.join(BACKLOG_DIR, id)
    const file = path.join(entryDir, 'index.json')
    let doc
    try {
      doc = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      return res.status(404).json({ error: `Backlog entry not found: ${id}` })
    }

    const images = Array.isArray(doc.images) ? doc.images.filter((x) => typeof x === 'string') : []
    // The frontend sends the resolved ImageMetadata src (e.g. a dev-mode
    // /@fs/.../images/xxx.jpg?origWidth=... URL). Match on the bare filename.
    const targetBase = path.basename(String(image).split('?')[0]).toLowerCase()
    const idx = images.findIndex((rel) => path.basename(rel).toLowerCase() === targetBase)
    if (idx === -1) {
      return res.status(400).json({ error: 'Image is not part of this backlog item' })
    }

    if (idx === 0) {
      delete doc.cover
    } else {
      doc.cover = idx
    }

    await writeJson(file, doc)
    return res.json({ ok: true, index: doc.cover ?? 0 })
  } catch (err) {
    console.error('[api] error:', err)
    return res.status(500).json({ error: String(err?.message || err) })
  }
})

app.listen(PORT, () => {
  console.log(`[myco] identify API listening on http://localhost:${PORT}`)
})
