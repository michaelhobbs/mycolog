export interface LocalizedString {
  en: string;
  de: string;
}

export interface Location {
  lat: number;
  lng: number;
  name?: LocalizedString;
}

export interface MushroomSighting {
  id: string;
  species: string;
  commonName: LocalizedString;
  dateSpotted: string;
  location: Location;
  imageUrl: string;
  determiningFeatures: LocalizedString[];
  notes?: LocalizedString;
  habitat?: LocalizedString;
}
