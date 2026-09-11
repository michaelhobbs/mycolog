import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const localizedString = z.object({
  en: z.string(),
  de: z.string(),
})

const species = defineCollection({
  loader: glob({ base: './src/content/species', pattern: '**/index.json' }),
  schema: z.object({
    scientificName: z.string(),
    commonName: localizedString,
    determiningFeatures: z.array(localizedString),
    notes: localizedString.optional(),
    habitat: localizedString.optional(),
    edibility: localizedString.optional(),
  }),
})

const sightings = defineCollection({
  loader: glob({ base: './src/content/sightings', pattern: '**/index.json' }),
  schema: ({ image }) =>
    z.object({
      species: z.string(),
      dateSpotted: z.string(),
      dateIdentified: z.string().optional(),
      location: z.object({
        lat: z.number(),
        lng: z.number(),
        name: localizedString.optional(),
      }),
      images: z.array(image()),
      notes: localizedString.optional(),
    }),
})

const backlog = defineCollection({
  loader: glob({ base: './src/content/backlog', pattern: '**/index.json' }),
  schema: ({ image }) =>
    z.object({
      dateSpotted: z.string(),
      images: z.array(image()),
    }),
})

export const collections = { species, sightings, backlog }
