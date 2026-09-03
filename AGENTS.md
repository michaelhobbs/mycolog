## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Backlog identification workflow (dev only)

The backlog identification page (`/{locale}/backlog/{slug}`) lets you promote an
unidentified backlog item into a sighting by filling a form (species dropdown +
add-new-species + a click-to-pin location map). It is **only generated in dev**;
`astro build` skips these routes.

It requires a local Express API alongside the Astro dev server:

```
node scripts/api.mjs        # identify API on http://localhost:4322
```

- The Astro dev server proxies `/myco/api` → `http://localhost:4322`
  (`vite.server.proxy` in `astro.config.mjs`).
- On form submit the API: optionally creates a new `species` entry, creates a new
  `sighting` entry (moving the item's images into it), and removes the backlog item.
- Backlog items live in the `backlog` content collection (`src/content/backlog/{n}`,
  numeric slug, `dateSpotted` + `images` only).

## Content collections

- `species` — shared species data (scientific/common name, determining features,
  habitat, edibility, notes). Sightings reference species by slug only.
- `sightings` — per-observation data (species ref, date, location, images, notes).
- `backlog` — unidentified items awaiting identification (date + images only).

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
