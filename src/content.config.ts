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
    cover: z
      .object({
        sighting: z.string(),
        index: z.number().int().nonnegative(),
      })
      .optional(),
  }),
})

const locations = defineCollection({
  loader: glob({ base: './src/content/locations', pattern: '**/index.json' }),
  schema: z.object({
    name: localizedString,
    description: localizedString.optional(),
    forestType: localizedString.optional(),
    soilType: localizedString.optional(),
    center: z.object({ lat: z.number(), lng: z.number() }).optional(),
  }),
})

const authors = defineCollection({
  loader: glob({ base: './src/content/authors', pattern: '**/index.json' }),
  schema: z.object({
    name: z.string(),
  }),
})

const sightings = defineCollection({
  loader: glob({ base: './src/content/sightings', pattern: '**/index.json' }),
  schema: ({ image }) =>
    z.object({
      species: z.string(),
      locationSlug: z.string(),
      authors: z.array(z.string()).min(1),
      dateSpotted: z.string(),
      dateIdentified: z.string().optional(),
      location: z.object({
        lat: z.number(),
        lng: z.number(),
      }),
      images: z.array(image()),
      notes: localizedString.optional(),
    }),
})

const backlog = defineCollection({
  loader: glob({ base: './src/content/backlog', pattern: '**/index.json' }),
  schema: ({ image }) =>
    z.object({
      authors: z.array(z.string()).min(1),
      dateSpotted: z.string(),
      images: z.array(image()),
      location: z.object({ lat: z.number(), lng: z.number() }).optional(),
    }),
})

export const collections = { species, locations, sightings, backlog, authors }
