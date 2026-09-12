import { statSync, accessSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())

function isDir(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

function exists(p) {
  try {
    accessSync(p)
    return true
  } catch {
    return false
  }
}

function patchTrees(rel) {
  const dir = path.join(ROOT, rel)
  let updated = 0
  for (const day of readdirSync(dir)) {
    const dayDir = path.join(dir, day)
    if (!isDir(dayDir)) continue
    for (const slug of readdirSync(dayDir)) {
      const sub = path.join(dayDir, slug)
      if (!isDir(sub)) continue
      const file = path.join(sub, 'index.json')
      if (!exists(file)) continue
      if (patchFile(file)) updated++
    }
  }
  return updated
}

function patchFlat(rel) {
  const dir = path.join(ROOT, rel)
  let updated = 0
  for (const id of readdirSync(dir)) {
    const file = path.join(dir, id, 'index.json')
    if (!exists(file)) continue
    if (patchFile(file)) updated++
  }
  return updated
}

function patchFile(file) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  if (json.authors) return false
  json.authors = ['michael']
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  console.log(`+ authors on ${file}`)
  return true
}

const sightings = patchTrees('src/content/sightings')
const backlog = patchFlat('src/content/backlog')
console.log(`authors added to ${sightings} sightings and ${backlog} backlog entries`)
