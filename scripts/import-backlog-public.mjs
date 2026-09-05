import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLIC = path.join(ROOT, 'public/images')
const BACKLOG = path.join(ROOT, 'src/content/backlog')

// Derive the photo's capture date (YYYY-MM-DD) from its EXIF metadata.
function exifDate(file) {
  const out = execFileSync('mdls', ['-raw', '-name', 'kMDItemContentCreationDate', file], {
    encoding: 'utf8',
  })
  const match = out.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) throw new Error(`could not derive date from ${file}`)
  return match[1]
}

// Next free backlog id = highest existing numeric folder + 1.
const existingIds = (await fs.readdir(BACKLOG)).filter((n) => /^\d+$/.test(n)).map(Number)
const nextId = Math.max(0, ...existingIds) + 1

const folders = (await fs.readdir(PUBLIC, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

let slug = nextId
for (const folder of folders) {
  const srcDir = path.join(PUBLIC, folder)
  const files = (await fs.readdir(srcDir)).filter((f) => /\.heic$/i.test(f)).sort()
  if (files.length === 0) {
    console.error(`!! no HEIC files in ${folder}`)
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
    JSON.stringify({ dateSpotted: date, images }, null, 2) + '\n',
  )

  console.log(`created ${itemDir} (${folder}, ${date}, ${images.length} images)`)
  slug++
}

console.log('done')
