import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLIC = path.join(ROOT, 'public/images')
const BACKLOG = path.join(ROOT, 'src/content/backlog')
const AUTHORS = path.join(ROOT, 'src/content/authors')

function slugify(s = '') {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Derive the photo's capture date (YYYY-MM-DD) from its EXIF metadata.
function exifDate(file) {
  const out = execFileSync('mdls', ['-raw', '-name', 'kMDItemContentCreationDate', file], {
    encoding: 'utf8',
  })
  const match = out.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) throw new Error(`could not derive date from ${file}`)
  return match[1]
}

// Ensure a content entry exists for the given author (slugs match folder names).
async function ensureAuthor(name) {
  const slug = slugify(name) || 'unknown'
  const dir = path.join(AUTHORS, slug)
  try {
    await fs.access(path.join(dir, 'index.json'))
  } catch {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify({ name }, null, 2) + '\n')
    console.log(`created author ${slug} (${name})`)
  }
  return slug
}

// Next free backlog id = highest existing numeric folder + 1.
const existingIds = (await fs.readdir(BACKLOG)).filter((n) => /^\d+$/.test(n)).map(Number)
const nextId = Math.max(0, ...existingIds) + 1

const authorDirs = (await fs.readdir(PUBLIC, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name !== '.DS_Store')
  .map((d) => d.name)
  .sort()

let slug = nextId
for (const author of authorDirs) {
  const authorDir = path.join(PUBLIC, author)
  const authorSlug = await ensureAuthor(author)
  const folders = (await fs.readdir(authorDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  for (const folder of folders) {
    const srcDir = path.join(authorDir, folder)
    const files = (await fs.readdir(srcDir)).filter((f) => /\.heic$/i.test(f)).sort()
    if (files.length === 0) {
      console.error(`!! no HEIC files in ${author}/${folder}`)
      continue
    }

    const date = exifDate(path.join(srcDir, files[0]))

    const itemDir = path.join(BACKLOG, String(slug).padStart(2, '0'))
    const imagesDir = path.join(itemDir, 'images')
    await fs.mkdir(imagesDir, { recursive: true })

    const images = []
    files.forEach((f, i) => {
      const n = String(i + 1).padStart(2, '0')
      const out = path.join(imagesDir, `${n}.jpg`)
      execFileSync('sips', ['-s', 'format', 'jpeg', path.join(srcDir, f), '--out', out], {
        stdio: 'ignore',
      })
      images.push(`./images/${n}.jpg`)
    })

    await fs.writeFile(
      path.join(itemDir, 'index.json'),
      JSON.stringify({ authors: [authorSlug], dateSpotted: date, images }, null, 2) + '\n',
    )

    console.log(`created ${itemDir} (${author}/${folder}, ${date}, ${images.length} images)`)
    slug++
  }
}

console.log('done')
