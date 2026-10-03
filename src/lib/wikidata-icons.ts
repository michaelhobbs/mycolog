// Resolve a morphology/edibility value QID to the URL of its Commons drawing.
//
// `icons.ts` records each icon's path as repo-relative
// (`src/data/wikidata/icons/...`), which is not what a template needs. This
// module globs the actual files so Vite emits and fingerprints them, and maps
// the QID to the built URL.
//
// A QID with no icon resolves to `null` rather than throwing: 4 values have no
// `icon (P2910)` and 1 more has an icon that belongs to a different value, so
// "no image" is a normal outcome that callers must render around. See
// `missingIcons` / `iconsToReview` in the generated index for the full list.

import { iconsByQid } from '../data/wikidata/icons'

const files = import.meta.glob('../data/wikidata/icons/**/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** `../data/wikidata/icons/hymeniumType/Lamella.png` -> `.../hymeniumType/Lamella.png` */
function normalise(key: string): string {
  return key.slice(key.indexOf('/icons/') + '/icons/'.length)
}

const byFile = new Map<string, string>()
for (const [key, url] of Object.entries(files)) {
  if (typeof url === 'string') byFile.set(normalise(key), url)
}

const cache = new Map<string, string | null>()

/**
 * The icon URL for a value QID, or `null` when Commons has no usable drawing.
 *
 * Ids resolve relative to the repo root by `icons.ts`, so `Q269345` -> the
 * file under `hymeniumType/`.
 */
export function iconUrlFor(qid: string): string | null {
  const hit = cache.get(qid)
  if (hit !== undefined) return hit
  const icon = iconsByQid[qid]
  const url = icon
    ? (byFile.get(icon.file.replace(/^src\/data\/wikidata\/icons\//, '')) ?? null)
    : null
  cache.set(qid, url)
  return url
}

/** The icon record for a value QID, for attribution when one is rendered. */
export function iconFor(qid: string) {
  return iconsByQid[qid] ?? null
}
