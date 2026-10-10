// The glossary registry.
//
// Frontmatter-only: this module is imported by build-time code (pages, the
// species page component, the facet builder) and is NEVER imported by a client
// script. The tooltip manager reads the short definitions out of per-term
// `data-glossary-short` attributes baked into the markup, not from this module,
// so the definitions never ship to the browser as a payload.
//
// `byQid` lets any render site join a Wikidata value (morphology/ecology/
// edibility QID) straight to its glossary entry; missing entries are a
// supported state -- a value without a curated definition simply renders
// without a tooltip.
import { entries } from './entries'
import type { GlossaryEntry } from './types'
export { entries as glossaryEntries } from './entries'
export type { GlossaryEntry, GlossaryGroup } from './types'
export { GLOSSARY_GROUPS } from './types'

export const glossaryById: Readonly<Record<string, GlossaryEntry>> = Object.fromEntries(
  entries.map((e) => [e.id, e]),
)

export const glossaryByQid: Readonly<Record<string, GlossaryEntry>> = Object.fromEntries(
  entries.flatMap((e) => (e.qid ? [[e.qid, e]] : [])),
)

export function entryForId(id: string): GlossaryEntry | undefined {
  return glossaryById[id]
}

export function entryForQid(qid: string): GlossaryEntry | undefined {
  return glossaryByQid[qid]
}

export function entriesInGroup(group: GlossaryEntry['group']): GlossaryEntry[] {
  return entries.filter((e) => e.group === group)
}
