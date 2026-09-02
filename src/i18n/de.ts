export default {
  lang: 'de',
  nav: {
    home: 'Startseite',
    map: 'Karte',
    log: 'Protokoll',
    mushrooms: 'Pilze',
  },
  home: {
    heroTitle: 'Pilze rund um Garmisch-Partenkirchen',
    heroSubtitle: 'Entdeckungen aus den Wäldern der Bayerischen Alpen',
    heroDescription:
      'Eine persönliche Sammlung von Pilzfunden in den Bergen und Wäldern rund um Garmisch-Partenkirchen. Jeder Eintrag enthält Artbestimmung, Merkmale, Standortdaten und Fotos.',
    heroCta: 'Auf der Karte ansehen',
    heroLogCta: 'Funde durchlesen',
    heroMushroomsCta: 'Alle Pilze durchstöbern',
    recentTitle: 'Letzte Beobachtungen',
    recentSubtitle: 'Die neuesten Funde aus unseren Wäldern',
    viewAll: 'Alle Funde auf der Karte ansehen →',
    warningTitle: 'Wichtiger Hinweis',
    warningText:
      'Sammelt nur Pilze, die ihr genau kennt! Im Zweifel lieber den Pilz stehen lassen. Viele giftige Arten sehen essbaren Pilzen zum Verwechseln ähnlich.',
    forestsTitle: 'Unsere Wälder',
    forestsText:
      'Der Raum Garmisch-Partenkirchen bietet eine Vielfalt an Lebensräumen: von Fichtenwäldern bis zu Buchenmischwäldern, von Wiesen bis zu alpinen Lagen.',
  },
  map: {
    title: 'Fundkarte',
    subtitle: 'Alle Beobachtungen auf einen Blick',
    legend: 'Legende',
    legendHint: 'Auf Marker klicken für Details',
    allSightings: 'Alle Beobachtungen',
    determiningFeatures: 'Bestimmungsmerkmale',
    habitat: 'Lebensraum',
    labels: {
      date: 'datum',
      loc: 'ort',
    },
  },
  card: {
    features: 'Bestimmungsmerkmale',
    more: 'mehr Details',
  },
  log: {
    title: 'Fundprotokoll',
    subtitle: 'Tage mit dokumentierten Pilzfunden',
    daysLabel: 'Tage',
    sightingsCount: 'Beobachtungen',
    today: 'Funde vom',
    noSightings: 'An diesem Tag wurden keine Funde verzeichnet.',
    backToLog: 'Alle Protokolltage',
    species: 'Art',
    location: 'Ort',
    habitat: 'Lebensraum',
  },
  mushrooms: {
    title: 'Pilzarten',
    subtitle: 'Alle bisher dokumentierten Arten',
    count: 'Arten',
    description: 'Beschreibung',
    features: 'Bestimmungsmerkmale',
    notes: 'Anmerkungen',
    habitat: 'Lebensraum',
    edibility: 'Genießbarkeit',
    sightings: 'Beobachtungen',
    backToIndex: 'Alle Arten',
    spottedIn: 'Gesehen in',
    onDate: 'am',
    at: 'bei',
    unknown: 'Unbekannt',
  },
  footer: {
    copyright: '© 2026 myco.log',
  },
  meta: {
    homeDescription:
      'Pilzbeobachtungen und Sammlertouren rund um Garmisch-Partenkirchen in den Bayerischen Alpen.',
    mapDescription:
      'Interaktive Karte der Pilzfunde rund um Garmisch-Partenkirchen.',
    homeTitle: 'myco.log — pilzfunde',
    mapTitle: 'karte — myco.log',
    logTitle: 'protokoll — myco.log',
  },
} as const;
