// Shared shapes for the per-species taxonomy snapshots.
export interface NameUsage {
  scientificName: string
  authorship?: string
  year?: string | number
  rank?: string
  usageId?: string | number
  status?: string
  parentUsageId?: string | number
}

export interface Variation extends NameUsage {
  parentUsageId: string | number
}

export interface TaxonomyData {
  colDatasetKey: string | number
  colUsageId?: string | number
  accepted: NameUsage
  basionym: NameUsage | null
  variations: Variation[]
  fullHistory: NameUsage[]
  lastUpdated: string
}
