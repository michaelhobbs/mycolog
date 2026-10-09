// Shared shape for the per-species Catalogue of Life classification snapshots
// in ./species. This is the site's source of truth for a species' higher ranks
// (phylum -> genus): it is read from the published Catalogue of Life release
// (catalogueoflife.org) rather than derived from Wikidata's `parent taxon`
// chain, because the catalogue is the authoritative checklist.

/** A taxon as named by Catalogue of Life, carrying its own taxon id. */
export interface ColTaxon {
  /** Catalogue of Life taxon id, e.g. `3NB5H`. */
  id: string
  name: string
}

/**
 * The five higher ranks stored per species. Every slot is optional because
 * Catalogue of Life's classification chain can skip a rank (e.g. class ->
 * family), and a missing slot is an honest gap in the source, never a lookup
 * failure. A consumer must not assume any given rank is present.
 */
export interface ColRanks {
  phylum?: ColTaxon
  class?: ColTaxon
  order?: ColTaxon
  family?: ColTaxon
  genus?: ColTaxon
}

export interface ColClassification {
  /** The content-collection slug this snapshot belongs to. */
  slug: string
  /** The ChecklistBank dataset the classification was read from. */
  colDatasetKey: number
  /** The human-readable release name, e.g. `COL26.9`. */
  colRelease: string
  /** The Catalogue of Life taxon id the species resolved to, e.g. `3NB5H`. */
  colId: string
  /** The accepted scientific name Catalogue of Life holds for that id. */
  acceptedName: string
  /** The usage status reported by Catalogue of Life, e.g. `accepted`. */
  status: string
  /**
   * How the species was resolved to `colId`, so a stale join is auditable.
   * `wikidata-p10585` and `name-search` are Catalogue of Life resolutions
   * against `colDatasetKey`; `index-fungorum` is a fallback for a species the
   * COL release holds under no matching name, read from the Index Fungorum
   * crawl (dataset `1028`) via the accepted usage in the taxonomy snapshot.
   * A renderer must therefore branch on this field rather than assuming every
   * row is Catalogue of Life.
   */
  matchedBy: 'wikidata-p10585' | 'name-search' | 'index-fungorum'
  classification: ColRanks
  /** ISO date the snapshot was last regenerated for this species. */
  lastUpdated: string
}
