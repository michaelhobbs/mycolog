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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/sightings', async (req, res) => {
  const { dateSpotted, location, species, newSpecies, backlogId, locationName, notes } =
    req.body || {}

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

app.listen(PORT, () => {
  console.log(`[myco] identify API listening on http://localhost:${PORT}`)
})
