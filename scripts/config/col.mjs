// Index Fungorum API crawl ("Species Fungorum") on ChecklistBank: mycology-focused,
// carries authorship + basionym relations + infraspecific children + synonyms.
export const DEFAULT_COL_DATASET_KEY = 1028
export const COL_DATASET_QUERY = 'Species Fungorum'

// The published Catalogue of Life release, used as the source of truth for each
// species' higher-rank classification (phylum -> genus). It is a different
// ChecklistBank dataset from the Species Fungorum crawl above: the live
// catalogueoflife.org taxon pages resolve against this key. Releases are
// versioned, so bump both deliberately to refresh the committed snapshot in
// src/data/col/species.
//
// This is the "Extended Release" (XR), not the base `COL26.9` (316321): the base
// release omits taxa and families this site has (it has no `Calocera cornea`, and
// gives `Pseudohydnum`/`Infundibulicybe` no family), whereas XR resolves them.
export const COL_CLASSIFICATION_DATASET_KEY = 316441
export const COL_CLASSIFICATION_RELEASE = 'COL26.9 XR'
