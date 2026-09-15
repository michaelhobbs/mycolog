import express from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CONTENT = path.join(ROOT, 'src', 'content')
const BACKLOG_DIR = path.join(CONTENT, 'backlog')
const SIGHTINGS_DIR = path.join(CONTENT, 'sightings')
const SPECIES_DIR = path.join(CONTENT, 'species')
const AUTHORS_DIR = path.join(CONTENT, 'authors')

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

    // 2. Find the backlog entry
    const backlogEntryDir = path.join(BACKLOG_DIR, String(backlogId))
    let backlogImages = []
    try {
      const imagesDir = path.join(backlogEntryDir, 'images')
      const files = (await fs.readdir(imagesDir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
      backlogImages = files.map((f) => ({ from: path.join(imagesDir, f), name: f }))
    } catch {
      return res.status(404).json({ error: `Backlog entry not found: ${backlogId}` })
    }
    if (!backlogImages.length) {
      return res.status(404).json({ error: `No images in backlog entry ${backlogId}` })
    }

    // Backlog authors (from import) + any selected/new authors supplied by the form.
    let backlogAuthors = []
    try {
      const meta = JSON.parse(await fs.readFile(path.join(backlogEntryDir, 'index.json'), 'utf8'))
      backlogAuthors = Array.isArray(meta.authors)
        ? meta.authors.filter((a) => typeof a === 'string')
        : []
    } catch {}
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
    for (let i = 0; i < backlogImages.length; i++) {
      const ext = path.extname(backlogImages[i].name).toLowerCase()
      const newName = `${speciesSlug}${i + 1}${ext}`
      await fs.copyFile(backlogImages[i].from, path.join(imagesDir, newName))
      imagePaths.push(`./images/${newName}`)
    }

    const sightingLocation = {
      lat: location.lat,
      lng: location.lng,
    }
    if (locationName && typeof locationName === 'string' && locationName.trim()) {
      const name = locationName.trim()
      sightingLocation.name = { en: name, de: name }
    }

    const sightingDoc = {
      species: speciesSlug,
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

app.listen(PORT, () => {
  console.log(`[myco] identify API listening on http://localhost:${PORT}`)
})
