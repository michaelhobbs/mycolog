import type { MushroomSighting } from '../types/mushroom';

export const sightings: MushroomSighting[] = [
  {
    id: '1',
    species: 'Amanita muscaria',
    commonName: { en: 'Fly Agaric', de: 'Fliegenpilz' },
    dateSpotted: '2026-08-20',
    location: {
      lat: 47.4917,
      lng: 11.0922,
      name: { en: 'Partnachklamm', de: 'Partnachklamm' },
    },
    imageUrl: '/images/amanita-muscaria.svg',
    determiningFeatures: [
      { en: 'Bright red cap with white spots', de: 'Leuchtend roter Hut mit weißen Punkten' },
      { en: 'White gills and stem', de: 'Weiße Lamellen und Stiel' },
      { en: 'Ring on stem', de: 'Am Stiel befindlicher Ring' },
      { en: 'Bulbous base', de: 'Knollige Basis' },
    ],
    notes: {
      en: 'Classic fairy-tale mushroom found near spruce trees',
      de: 'Klassischer Märchenpilz, gefunden bei Fichten',
    },
    habitat: { en: 'Coniferous forest', de: 'Nadelwald' },
  },
  {
    id: '2',
    species: 'Boletus edulis',
    commonName: { en: 'King Bolete', de: 'Steinpilz' },
    dateSpotted: '2026-08-18',
    location: {
      lat: 47.5000,
      lng: 11.1000,
      name: { en: 'Eibsee', de: 'Eibsee' },
    },
    imageUrl: '/images/boletus-edulis.svg',
    determiningFeatures: [
      { en: 'Brown cap 5–25 cm wide', de: 'Brauner Hut 5–25 cm breit' },
      { en: 'Thick white stem with reticulation', de: 'Dicker weißer Stiel mit Netzzeichnung' },
      { en: 'Spongy pores instead of gills', de: 'Schwammige Poren statt Lamellen' },
      { en: 'No ring on stem', de: 'Kein Ring am Stiel' },
    ],
    notes: {
      en: 'Excellent edible species, found in mossy area',
      de: 'Hervorragender Speisepilz, gefunden in moosiger Umgebung',
    },
    habitat: { en: 'Mixed forest with beech and spruce', de: 'Mischwald mit Buche und Fichte' },
  },
  {
    id: '3',
    species: 'Cantharellus cibarius',
    commonName: { en: 'Chanterelle', de: 'Pfifferling' },
    dateSpotted: '2026-08-15',
    location: {
      lat: 47.4850,
      lng: 11.0850,
      name: { en: 'Near Garmisch', de: 'Bei Garmisch' },
    },
    imageUrl: '/images/cantharellus-cibarius.svg',
    determiningFeatures: [
      { en: 'Egg-yellow to orange colour', de: 'Eigelb bis orange Farbe' },
      { en: 'False gills — forked ridges', de: 'Scheidlamellen — gegabelte Leisten' },
      { en: 'Fruity aroma like apricots', de: 'Fruchtiger Duft nach Aprikosen' },
      { en: 'Solid flesh', de: 'Festes Fleisch' },
    ],
    habitat: { en: 'Beech forest with moss', de: 'Buchenwald mit Moos' },
  },
  {
    id: '4',
    species: 'Armillaria mellea',
    commonName: { en: 'Honey Fungus', de: 'Honigpilz' },
    dateSpotted: '2026-08-12',
    location: {
      lat: 47.4950,
      lng: 11.0950,
      name: { en: 'Zugspitze approach', de: 'Zugspitze-Zufahrt' },
    },
    imageUrl: '/images/armillaria-mellea.svg',
    determiningFeatures: [
      { en: 'Honey-yellow to brown cap', de: 'Honigfarbener bis brauner Hut' },
      { en: 'Ring on stem', de: 'Ring am Stiel' },
      { en: 'Grows in clusters on wood', de: 'Wächst büschelweise auf Holz' },
      { en: 'White spore print', de: 'Weißer Sporenabdruck' },
    ],
    notes: {
      en: 'Found on a decaying tree stump',
      de: 'Gefunden auf einem verrotteten Baumstumpf',
    },
    habitat: { en: 'Forest edge', de: 'Waldrand' },
  },
  {
    id: '5',
    species: 'Leccinum scabrum',
    commonName: { en: 'Brown Birch Bolete', de: 'Röhrling' },
    dateSpotted: '2026-08-10',
    location: {
      lat: 47.4880,
      lng: 11.0880,
      name: { en: 'Burgrain', de: 'Burgrain' },
    },
    imageUrl: '/images/leccinum-scabrum.svg',
    determiningFeatures: [
      { en: 'Brown cap with scaly texture', de: 'Brauner Hut mit schuppiger Textur' },
      { en: 'White to grey stem with dark scales', de: 'Weißer bis grauer Stiel mit dunklen Schuppen' },
      { en: 'Pores instead of gills', de: 'Poren statt Lamellen' },
      { en: 'Flesh turns slightly pink when cut', de: 'Fleisch wird beim Anschnitt leicht rosa' },
    ],
    habitat: { en: 'Birch forest', de: 'Birkenwald' },
  },
  {
    id: '6',
    species: 'Macrolepiota procera',
    commonName: { en: 'Parasol Mushroom', de: 'Parasolpilz' },
    dateSpotted: '2026-08-08',
    location: {
      lat: 47.4920,
      lng: 11.0820,
      name: { en: 'Mittenwald road', de: 'Mittenwalder Straße' },
    },
    imageUrl: '/images/macrolepiota-procera.svg',
    determiningFeatures: [
      { en: 'Large umbrella-shaped cap (up to 30 cm)', de: 'Großer pergamentartiger Hut (bis 30 cm)' },
      { en: 'Snake-skin pattern on stem', de: 'Schlangenhaut-Zeichnung am Stiel' },
      { en: 'Movable ring', de: 'Beweglicher Ring' },
      { en: 'Tall slender stem (up to 30 cm)', de: 'Hoher schlanker Stiel (bis 30 cm)' },
    ],
    notes: {
      en: 'Found in meadow near forest edge',
      de: 'Gefunden auf einer Wiese am Waldrand',
    },
    habitat: { en: 'Meadow and forest edge', de: 'Wiese und Waldrand' },
  },
];
