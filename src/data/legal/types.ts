// Shared shapes for the German foraging-status snapshot (src/data/legal).
//
// Two independent facts per species, deliberately kept apart:
//   * `protection` -- legal, federal: what the BArtSchV Annex 1 forbids and
//     what its §2(1) exempts for small quantities of personal use.
//   * `redList` -- conservation status from the German Red List of macrofungi
//     (Dämmrich et al. 2016, BfN). Threatened is not the same as protected.
export type ForagingProtection = 'prohibited' | 'smallQuantityExempt' | 'notListed'

export interface ForagingEntry {
  protection: ForagingProtection
  /** The Annex 1 entry that matched, e.g. `Boletus appendiculatus` or `Hygrocybe spp.` */
  lawName?: string
  /** `genus` entries are only ever tested against the accepted genus (see the script). */
  matchedBy?: 'accepted' | 'synonym' | 'genus'
  redList?: {
    /** Raw category code; the labels live in the i18n strings, not in the data. */
    code: string
    matchedBy: 'accepted' | 'synonym'
  }
}

export interface ForagingSources {
  bartschvAnlage1: string
  bartschvSection2: string
  redListZip: string
  redListCitation: string
  /** Date the raw sources were fetched; part of the displayable citation. */
  retrieved: string
}
