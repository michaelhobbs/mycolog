import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localizedString = z.object({
  en: z.string(),
  de: z.string(),
});

const sightings = defineCollection({
  loader: glob({ base: './src/content/sightings', pattern: '**/index.json' }),
  schema: ({ image }) =>
    z.object({
      id: z.string(),
      species: z.string(),
      commonName: localizedString,
      dateSpotted: z.string(),
      location: z.object({
        lat: z.number(),
        lng: z.number(),
        name: localizedString.optional(),
      }),
      images: z.array(image()),
      determiningFeatures: z.array(localizedString),
      notes: localizedString.optional(),
      habitat: localizedString.optional(),
      edibility: localizedString.optional(),
    }),
});

export const collections = { sightings };
