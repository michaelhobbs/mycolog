import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { format } from 'prettier'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const NEWS_DIR = path.join(ROOT, 'src', 'content', 'news')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EVENT_TYPES = ['backlog-added', 'identified', 'new-species', 'new-location']

const prettierOptions = { parser: 'json', semi: false, printWidth: 100 }

// Append a news event as a content-collection entry at
// src/content/news/{date}-{type}-{seq}/index.json. Deterministic; each call
// adds a new file and never mutates existing ones.
export async function appendNewsEvent(event) {
  if (!event || !EVENT_TYPES.includes(event.type)) {
    throw new Error(`invalid news event type: ${event?.type}`)
  }
  if (!event.date || !DATE_RE.test(event.date)) {
    throw new Error(`invalid news event date: ${event?.date}`)
  }

  const prefix = `${event.date}-${event.type}`
  let seq = 0
  try {
    const entries = await fs.readdir(NEWS_DIR, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const m = e.name.match(new RegExp(`^${prefix}-(\\d+)$`))
      if (m) seq = Math.max(seq, Number(m[1]))
    }
  } catch {
    // NEWS_DIR does not exist yet; the run below creates it.
  }
  seq += 1

  const dir = path.join(NEWS_DIR, `${prefix}-${String(seq).padStart(2, '0')}`)
  await fs.mkdir(dir, { recursive: true })
  const text = await format(`${JSON.stringify(event, null, 2)}\n`, prettierOptions)
  await fs.writeFile(path.join(dir, 'index.json'), text)
  console.log(`[news] recorded ${event.type} (${event.date}) -> ${dir}`)
}
