// Resolve a morphology/edibility value QID to the URL of the drawing that
// illustrates it.
//
// Two sources, in order of preference:
//
// 1. `src/data/nanobanana/` -- purpose-drawn vector diagrams and generated
//    illustrations, one file per value, named for that value's key in the enum in
//    `morphology-types.ts`. Stylised, consistent with the page's own palette, and
//    a square vector rather than a cropped photograph.
// 2. `icons.ts` -- the Commons drawings, recorded with their path as
//    repo-relative (`src/data/wikidata/icons/...`), which is not what a template
//    needs. This module globs the actual files so Vite emits and fingerprints
//    them, and maps the QID to the built URL.
//
// A QID with neither resolves to `null` rather than throwing: 4 values have no
// `icon (P2910)` and 1 more has an icon that belongs to a different value, so
// "no image" is a normal outcome that callers must render around. See
// `missingIcons` / `iconsToReview` in the generated index for the full list.
//
// The two sources are deliberately not merged. They are different kinds of
// picture of different provenance, so `generatedIconFor` and `iconFor` report
// which one a QID actually resolves to, and a caller rendering attribution must
// ask for the source it is about to display rather than assuming Commons.

import { colorsByQid, iconsByQid } from '../data/wikidata/icons'
import {
  HymeniumAttachment,
  HymeniumType,
  MushroomEcologicalType,
} from '../data/wikidata/morphology-types'

const files = import.meta.glob('../data/wikidata/icons/**/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const generated = import.meta.glob('../data/nanobanana/**/*.{svg,jpeg,jpg,png}', {
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

/**
 * Which property each `nanobanana` directory illustrates, keyed by directory
 * name. The QID always comes from the enum, never from the file name, so a
 * picture cannot claim to illustrate a value it is not in the type spec for.
 *
 * Properties absent here simply have no generated artwork and fall back to
 * Commons: `mushroomCapShape`, `stipeCharacter`, `sporePrintColor`, `edibility`.
 */
const GENERATED_DIRS: Record<string, Record<string, string>> = {
  hymeniumType: HymeniumType,
  hymeniumAttachment: HymeniumAttachment,
  mushroomEcologicalType: MushroomEcologicalType,
}

/** `../data/nanobanana/hymeniumType/Lamella.jpeg` -> `hymeniumType` + `Lamella` */
const GENERATED_PATH = /\/nanobanana\/([^/]+)\/([^/]+)\.(?:svg|jpe?g|png)$/

const generatedByQid = new Map<string, { url: string; property: string; value: string }>()
for (const [key, url] of Object.entries(generated)) {
  if (typeof url !== 'string') continue
  const parts = GENERATED_PATH.exec(key)
  // A file whose name is not a value key is left alone rather than guessed at:
  // it renders as the Commons drawing, which is the pre-existing behaviour.
  if (!parts) continue
  const [, property, value] = parts
  const qid = GENERATED_DIRS[property]?.[value]
  if (!qid) continue
  generatedByQid.set(qid, { url, property, value })
}

const cache = new Map<string, string | null>()
const colorCache = new Map<string, string[]>()

/**
 * The icon URL for a value QID, or `null` when there is no usable picture.
 *
 * Ids resolve relative to the repo root by `icons.ts`, so `Q269345` -> the file
 * under `hymeniumType/`.
 */
export function iconUrlFor(qid: string): string | null {
  const hit = cache.get(qid)
  if (hit !== undefined) return hit
  const picture = generatedByQid.get(qid)
  const icon = iconsByQid[qid]
  const url = picture
    ? picture.url
    : icon
      ? (byFile.get(icon.file.replace(/^src\/data\/wikidata\/icons\//, '')) ?? null)
      : null
  cache.set(qid, url)
  return url
}

/**
 * The generated illustration for a value QID, or `null` when it falls back to
 * Commons. `property` is the enum name and `value` its key, so a caller can word
 * a caption or a credit from the data rather than hard-coding it.
 */
export function generatedIconFor(
  qid: string,
): { url: string; property: string; value: string } | null {
  return generatedByQid.get(qid) ?? null
}

/**
 * The Commons record for a value QID, for attribution when one is rendered.
 *
 * Only meaningful when `generatedIconFor(qid)` is `null`: these are the source,
 * licence and author of the Commons drawing, and they say nothing about the
 * generated illustration that takes its place.
 */
export function iconFor(qid: string) {
  return iconsByQid[qid] ?? null
}

/**
 * Every sRGB triplet Wikidata records for a value, or `[]` when it records none.
 *
 * This is independent of the drawing: three spore print values are drawn but
 * carry no triplet, and 13 carry a triplet but no drawing, so a caller must ask
 * for both rather than treat one as evidence of the other. Colours exist only for
 * the colour-valued properties (spore print colour), which is why the other five
 * groups always return an empty array.
 *
 * The array is **not** a single canonical colour. Some values have several
 * triplets -- purple-brown has five -- all at `normal` rank, so there is no
 * preferred statement to pick. Every one is returned, sorted; choosing one would
 * be our invention, not Wikidata's.
 */
export function colorsFor(qid: string): string[] {
  const hit = colorCache.get(qid)
  if (hit !== undefined) return hit
  const colors = colorsByQid[qid] ?? []
  colorCache.set(qid, colors)
  return colors
}
