import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SIGHTINGS_DIR = path.join(process.cwd(), 'src/content/sightings')

const files = []
for (const day of readdirSync(SIGHTINGS_DIR)) {
  const dayDir = path.join(SIGHTINGS_DIR, day)
  for (const slug of readdirSync(dayDir)) {
    const file = path.join(dayDir, slug, 'index.json')
    if (readFileSync(file, 'utf8').trim().startsWith('{')) files.push(file)
  }
}

let updated = 0
for (const file of files) {
  const added = execSync(`git log --diff-filter=A --format='%ad' --date=short -1 -- "${file}"`, {
    stdio: 'pipe',
  })
    .toString()
    .trim()
  if (!added) {
    console.error(`no git add-date for ${file}`)
    continue
  }
  const json = JSON.parse(readFileSync(file, 'utf8'))
  if (json.dateIdentified) {
    console.log(`skip (already set) ${file} -> ${json.dateIdentified}`)
    continue
  }
  const ordered = {}
  for (const [k, v] of Object.entries({ dateIdentified: added, ...json })) ordered[k] = v
  writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n')
  console.log(`${file} -> ${added}`)
  updated++
}

console.log(`updated ${updated} sighting files`)
