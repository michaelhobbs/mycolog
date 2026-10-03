// Shared shapes for the per-species Wikidata snapshots in ./species.
//
// The morphology value types are deliberately narrow unions derived from each
// property's Wikidata `one-of` constraint (see ../morphology-types), so a QID
// that is not a legal value of its property fails `astro check` instead of
// typing as an opaque string. That is the whole point of typing this data at
// all: the generator cannot silently emit a value the enum does not allow.

import type {
  HymeniumTypeValue,
  HymeniumAttachmentValue,
  MushroomCapShapeValue,
  StipeCharacterValue,
  SporePrintColorValue,
  MushroomEcologicalTypeValue,
  EdibilityValue,
} from '../morphology-types'

/** A monolingual name or string value, e.g. a `taxon common name (P1843)`. */
export interface LocalizedName {
  lang: string
  value: string
}

/**
 * A reference to another Wikidata item, carrying its labels in each language.
 *
 * Both `en` and `de` are kept because these values have to render on a German
 * page, and the fungal terms are German-authored on Wikidata. A value may lack
 * a translation, so callers should fall back to `en` before rendering nothing.
 */
export interface ItemRef<T extends string = string> {
  pid: string
  qid: T
  labels: Partial<Record<'en' | 'de', string>>
}

/** An identifier in an external taxonomy database, with a resolved link. */
export interface ExternalId {
  pid: string
  /** The database's own name, so a caller can render "MycoBank: MB 1234". */
  source: string
  value: string
  /**
   * A link to the record, built from the property's Wikidata formatter URL
   * (`formatter URL`, P1630) with the value substituted. Read from Wikidata
   * rather than hardcoded here so the pattern cannot drift out of date.
   *
   * Required, and the generator skips any identifier whose property has no
   * formatter URL: an id we cannot link is not worth rendering as a source.
   */
  url: string
}

export interface TaxonomyData {
  taxonName: string
  taxonRank: ItemRef
  parentTaxon?: ItemRef[]
  instanceOf?: ItemRef[]
  authorCitation?: string
  shortName?: string
  basionym?: ItemRef[]
}

export interface NamesData {
  /** English and German labels/descriptions plus aliases, for `en`/`de`.
   *  All optional: a taxon need not carry every one of these languages. */
  labels?: Partial<Record<'en' | 'de', string>>
  descriptions?: Partial<Record<'en' | 'de', string>>
  aliases?: Partial<Record<'en' | 'de', string[]>>
  /** `taxon common name (P1843)` across every language Wikidata has. Always
   *  present, possibly empty, so a consumer can map over it unconditionally. */
  commonNames: LocalizedName[]
}

export interface MorphologyData {
  hymeniumType?: ItemRef<HymeniumTypeValue>
  capShape?: ItemRef<MushroomCapShapeValue>[]
  hymeniumAttachment?: ItemRef<HymeniumAttachmentValue>
  stipeCharacter?: ItemRef<StipeCharacterValue>
  sporePrintColor?: ItemRef<SporePrintColorValue>
}

export interface EcologyData {
  ecologicalType?: ItemRef<MushroomEcologicalTypeValue>[]
}

export interface EdibilityData {
  /** `edibility (P789)` is multi-valued: a species is often both edible and
   *  medicinal, or poisonous and psychoactive, so this is always an array.
   *  Empty means Wikidata makes no edibility claim, which is not the same as
   *  "edible" -- do not render an empty list as safe to eat. */
  values: ItemRef<EdibilityValue>[]
  /** `taxon status (P141)`, which here is the IUCN conservation status. */
  conservationStatus?: ItemRef[]
}

export interface MediaData {
  /**
   * Commons filenames from `image (P18)`. Note these are NOT vetted for
   * licensing the way ../icons is -- that file carries per-file author and
   * licence because its images are actually displayed.
   */
  /** Always present, possibly empty: 3 of the 47 species carry no `image (P18)`. */
  images: string[]
  commonsCategory?: string
  commonsGallery?: string
}

export interface WikidataSpeciesData {
  /** The content-collection slug this snapshot belongs to. */
  slug: string
  wikidataId: `Q${number}`
  taxonomy: TaxonomyData
  names: NamesData
  morphology: MorphologyData
  ecology: EcologyData
  edibility: EdibilityData
  media: MediaData
  externalIds: ExternalId[]
}
