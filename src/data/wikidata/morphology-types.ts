// Morphology property types with enums based on Wikidata constraints
// Property definitions and allowed values from Wikidata

// P783 - hymenium type (one-of constraint)
export const HymeniumType = {
  Lamella: 'Q269345',
  Pores: 'Q19861549',
  Smooth: 'Q19861550',
  Ridges: 'Q19861551',
  Teeth: 'Q19861552',
  Gleba: 'Q2034230',
} as const

export type HymeniumTypeValue = (typeof HymeniumType)[keyof typeof HymeniumType]

// P784 - mushroom cap shape
export const MushroomCapShape = {
  Campanulate: 'Q19887953',
  Conical: 'Q19887954',
  Convex: 'Q14544535',
  Depressed: 'Q19887955',
  Flat: 'Q19887957',
  Infundibuliform: 'Q19887958',
  Offset: 'Q14544541',
  Ovate: 'Q19887961',
  Umbilicate: 'Q19887962',
  Umbonate: 'Q19887964',
  NoMushroomCap: 'Q19887965',
  ConcaveToPlane: 'Q23058598',
  SemiSpherical: 'Q62023127',
} as const

export type MushroomCapShapeValue = (typeof MushroomCapShape)[keyof typeof MushroomCapShape]

// P785 - hymenium attachment
export const HymeniumAttachment = {
  Adnate: 'Q14544569',
  Adnexed: 'Q19887923',
  Decurrent: 'Q19887925',
  Emarginate: 'Q19887926',
  Free: 'Q14544563',
  Seceding: 'Q19887929',
  Sinuate: 'Q19887930',
  Subdecurrent: 'Q19887931',
  NoHymeniumAttachment: 'Q19887932',
} as const

export type HymeniumAttachmentValue = (typeof HymeniumAttachment)[keyof typeof HymeniumAttachment]

// P786 - stipe character
export const StipeCharacter = {
  Bare: 'Q14544581',
  Ring: 'Q14544582',
  Volva: 'Q19887985',
  RingAndVolva: 'Q19887987',
  Cortina: 'Q19887988',
  Reticulate: 'Q131915205',
} as const

export type StipeCharacterValue = (typeof StipeCharacter)[keyof typeof StipeCharacter]

// P787 - spore print color
export const SporePrintColor = {
  Black: 'Q23445',
  BlackishBrown: 'Q19888339',
  Brown: 'Q47071',
  Buff: 'Q2085487',
  Cream: 'Q2730433',
  Green: 'Q3133',
  Ochre: 'Q194191',
  Olive: 'Q864152',
  OliveBrown: 'Q19888352',
  Pink: 'Q429220',
  PinkishBrown: 'Q19888366',
  Purple: 'Q3257809',
  PurpleBlack: 'Q19888373',
  PurpleBrown: 'Q19888381',
  Salmon: 'Q2015138',
  Tan: 'Q1670336',
  White: 'Q23444',
  Yellow: 'Q943',
  YellowOrange: 'Q16645086',
  YellowBrown: 'Q19888422',
  Bordeaux: 'Q10859033',
  RedOrange: 'Q62058583',
} as const

export type SporePrintColorValue = (typeof SporePrintColor)[keyof typeof SporePrintColor]

// P788 - mushroom ecological type
export const MushroomEcologicalType = {
  Mycorrhiza: 'Q99974',
  Saprobiont: 'Q114750',
  Parasitism: 'Q186517',
  NematophagousFungus: 'Q357006',
} as const

export type MushroomEcologicalTypeValue =
  (typeof MushroomEcologicalType)[keyof typeof MushroomEcologicalType]

// P789 - edibility
export const Edibility = {
  ChoiceMushroom: 'Q19888517',
  EdibleMushroom: 'Q654236',
  InedibleMushroom: 'Q4317894',
  CautionMushroom: 'Q19888537',
  PsychoactiveMushroom: 'Q1169875',
  AllergenicMushroom: 'Q19888579',
  DeadlyMushroom: 'Q19888591',
  EdibleWhenCooked: 'Q62102033',
  MedicinalMushrooms: 'Q1686195',
  PoisonousMushroom: 'Q359511',
} as const

export type EdibilityValue = (typeof Edibility)[keyof typeof Edibility]

// Property definitions
export const WikidataMushroomProperties = {
  HymeniumType: 'P783',
  MushroomCapShape: 'P784',
  HymeniumAttachment: 'P785',
  StipeCharacter: 'P786',
  SporePrintColor: 'P787',
  MushroomEcologicalType: 'P788',
  Edibility: 'P789',
} as const
