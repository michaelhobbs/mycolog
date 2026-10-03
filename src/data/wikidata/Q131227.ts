// Wikidata data for Amanita muscaria (Q131227)
import type {
  HymeniumTypeValue,
  HymeniumAttachmentValue,
  MushroomCapShapeValue,
  StipeCharacterValue,
  SporePrintColorValue,
  MushroomEcologicalTypeValue,
  EdibilityValue,
} from './morphology-types'
import {
  HymeniumType,
  HymeniumAttachment,
  MushroomCapShape,
  StipeCharacter,
  SporePrintColor,
  MushroomEcologicalType,
  Edibility,
} from './morphology-types'

export interface LocalizedName {
  lang: string
  value: string
}

export interface MorphologyTyped {
  hymeniumType: {
    pid: 'P783'
    qid: HymeniumTypeValue
    label: string
  }
  hymeniumAttachment: {
    pid: 'P785'
    qid: HymeniumAttachmentValue
    label: string
  }
  capShape: Array<{
    pid: 'P784'
    qid: MushroomCapShapeValue
    label: string
  }>
  stipeCharacter: {
    pid: 'P786'
    qid: StipeCharacterValue
    label: string
  }
  sporePrintColor: {
    pid: 'P787'
    qid: SporePrintColorValue
    label: string
  }
}

export interface EcologyTyped {
  ecologicalType: Array<{
    pid: 'P788'
    qid: MushroomEcologicalTypeValue
    label: string
  }>
}

export interface WikidataSpeciesTyped {
  wikidataId: 'Q131227'
  scientificName: string
  commonNames: LocalizedName[]
  morphology: MorphologyTyped
  ecology: EcologyTyped
  edibility: Array<{
    pid: 'P789'
    qid: EdibilityValue
    label: string
  }>
}

export const amanitaMuscariaQ131227: WikidataSpeciesTyped = {
  wikidataId: 'Q131227',
  scientificName: 'Amanita muscaria',
  commonNames: [
    { lang: 'cy', value: "amanita'r gwybed" },
    { lang: 'bar', value: 'Fliangschwammerl' },
    { lang: 'bar', value: 'Flóingschwammerl' },
    { lang: 'be', value: 'Чырвоны мухамор' },
    { lang: 'bg', value: 'Червена мухоморка' },
    { lang: 'ca', value: 'Reig bord' },
    { lang: 'ca', value: 'Reig de fageda' },
    { lang: 'cs', value: 'muchomůrka červená' },
    { lang: 'de', value: 'Fliegenpilz' },
    { lang: 'en', value: 'Fly agaric' },
    { lang: 'et', value: 'Punane kärbseseen' },
    { lang: 'fr', value: 'Amanite tue-mouches' },
    { lang: 'hu', value: 'Légyölő galóca' },
    { lang: 'it', value: 'Ovolaccio' },
    { lang: 'it', value: 'ovolo malefico' },
    { lang: 'ja', value: 'ベニテングタケ' },
    { lang: 'lt', value: 'Paprastoji musmirė' },
    { lang: 'nl', value: 'Vliegenzwam' },
    { lang: 'nb', value: 'Rød fluesopp' },
    { lang: 'pl', value: 'muchomor czerwony' },
    { lang: 'pt', value: 'Agário-das-moscas' },
    { lang: 'pt', value: 'mata-moscas' },
    { lang: 'ru', value: 'Красный мухомор' },
    { lang: 'sk', value: 'Muchotrávka červená' },
    { lang: 'sv', value: 'Röd flugsvamp' },
    { lang: 'tr', value: 'Sinek mantarı' },
    { lang: 'uk', value: 'Мухомор червоний' },
    { lang: 'wa', value: 'Amanite touwe-moxhe' },
    { lang: 'zh', value: '毒蠅傘（繁體、正體）；毒蝇伞（简体）' },
    { lang: 'nl', value: 'vliegenzwam' },
    { lang: 'fr', value: 'amanite tue-mouches' },
    { lang: 'fi', value: 'punakärpässieni' },
    { lang: 'es', value: 'matamoscas' },
    { lang: 'sl', value: 'rdeča mušnica' },
    { lang: 'zh', value: '毒蝇鹅膏' },
  ],
  morphology: {
    hymeniumType: {
      pid: 'P783',
      qid: HymeniumType.Lamella,
      label: 'lamella',
    },
    hymeniumAttachment: {
      pid: 'P785',
      qid: HymeniumAttachment.Free,
      label: 'free hymenium attachment',
    },
    capShape: [
      {
        pid: 'P784',
        qid: MushroomCapShape.Flat,
        label: 'flat mushroom cap',
      },
      {
        pid: 'P784',
        qid: MushroomCapShape.Convex,
        label: 'convex mushroom cap',
      },
    ],
    stipeCharacter: {
      pid: 'P786',
      qid: StipeCharacter.RingAndVolva,
      label: 'ring and volva stipe',
    },
    sporePrintColor: {
      pid: 'P787',
      qid: SporePrintColor.White,
      label: 'white',
    },
  },
  ecology: {
    ecologicalType: [
      {
        pid: 'P788',
        qid: MushroomEcologicalType.Mycorrhiza,
        label: 'mycorrhiza',
      },
    ],
  },
  edibility: [
    {
      pid: 'P789',
      qid: Edibility.PoisonousMushroom,
      label: 'poisonous mushroom',
    },
    {
      pid: 'P789',
      qid: Edibility.PsychoactiveMushroom,
      label: 'psychoactive mushroom',
    },
    {
      pid: 'P789',
      qid: Edibility.MedicinalMushrooms,
      label: 'medicinal mushrooms',
    },
  ],
}

export default amanitaMuscariaQ131227
