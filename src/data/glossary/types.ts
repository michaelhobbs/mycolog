// Glossary data model.
//
// The glossary is a curated list of the mycological terms a general reader may
// not know: morphology structures and their Wikidata values, the ecology and
// edibility vocabulary, and the nomenclature terms. Obvious words ("cap shape",
// "convex", "poisonous") are deliberately absent.
//
// Entries are locale-agnostic ids; the definitions are written in English for
// now (the site's i18n files hold only UI chrome, not this module). When
// German definitions are added, wrap `short`/`body` in `{ en, de }` like the
// content collections do -- the consumers (tooltip, page) only read text, so
// the change stays local to the entries and the render call sites.
export const GLOSSARY_GROUPS = [
  'structure',
  'capShape',
  'hymeniumAttachment',
  'stipe',
  'sporePrintColor',
  'ecology',
  'edibility',
  'nomenclature',
] as const

export type GlossaryGroup = (typeof GLOSSARY_GROUPS)[number]

export interface GlossaryEntry {
  /** Stable id: the anchor on /glossary#id and the data-glossary attribute. */
  id: string
  /** The term, as displayed on the glossary page. */
  term: string
  /** Tooltip-length definition (one to two sentences). */
  short: string
  /** Longer definition for the glossary page. */
  body: string
  group: GlossaryGroup
  /** Wikidata QID of the term, when one exists -- links the page to the
   *  existing ValueMark drawings/colours. */
  qid?: string
  /** Render the term upright rather than italic -- for nomenclatural rank
   *  abbreviations (`var.`, `subsp.`, `f.`), which are never italicised. */
  upright?: boolean
}
