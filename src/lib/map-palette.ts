import type * as maplibregl from 'maplibre-gl'

/**
 * Site map palettes, one per UI theme — the single source of truth for the
 * colour of every map and of the site's own map layers.
 *
 * Two layers of colour live here:
 *   - the *base* palette recolours OpenFreeMap `fiord` layers (which ship a
 *     dark navy style of their own — under `mono` every visible layer must be
 *     overridden or navy bleeds through), plus the label treatment; and
 *   - the *overlay* record colours the layers this site adds on top (masks,
 *     markers, clusters, hiking additions).
 *
 * Consumers do **not** mutate a live map's paint. `scripts/generate-map-themes.mjs`
 * bakes each theme into one committed style JSON under
 * `public/map-themes/{theme}.json`: the base palette and label treatment are
 * merged straight into a clone of the fiord layer specs, and the overlay
 * record is carried in `style.metadata.mycoOverlays`. The live maps load the
 * JSON directly (`themeStyleUrl()`) and switch themes with `map.setStyle()`,
 * colouring their own layers from the JSON's overlay table
 * (`overlayPaints()`). `scripts/generate-thumbnails.mjs` bakes the **tui**
 * record into a style object for build-time previews — those stay dark under
 * any light theme, a deliberate limitation (a static image cannot follow a
 * visitor's choice).
 *
 * Layer ids belong to the `fiord` style and are not stable across style
 * versions — `landcover_glacier` is absent in the current one. Every consumer
 * must skip missing layers rather than assume they exist. The same guard is
 * what makes it safe for one theme's overlay record to name layers another
 * theme's map does not have (e.g. `hiking-*` on a MiniMap).
 */
export type PalettePaint = Record<string, string | number | number[]>

export type ThemeName =
  'tui' | 'mono' | 'brut' | 'neobrut' | 'nord' | 'gruvbox' | 'solarized' | 'catppuccin' | 'phosphor'

/** The dark terminal palette (site default — and what thumbnails bake). */
export const PALETTE: Record<string, PalettePaint> = {
  background: { 'background-color': '#0e120b' },
  landcover_wood: { 'fill-color': '#151a10', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#11150c', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#20291a' },
  landcover_glacier: { 'fill-color': '#20291a' },

  water: { 'fill-color': '#2a7d94' },
  waterway: { 'line-color': '#2a6a80' },
  building: { 'fill-color': '#263222' },

  highway_major_casing: { 'line-color': '#151a10' },
  highway_major_inner: { 'line-color': '#d4f0d4' },
  highway_major_subtle: { 'line-color': '#d4f0d4', 'line-opacity': 0.6 },
  highway_motorway_casing: { 'line-color': '#151a10' },
  highway_motorway_inner: { 'line-color': '#d4f0d4' },
  highway_minor: { 'line-color': '#8fbf8f' },
  highway_path: { 'line-color': '#33ff33', 'line-dasharray': [1.5, 1.5] },

  boundary_state: { 'line-color': '#2d5a2d' },
  'boundary_country_z5-': { 'line-color': '#4a8f4a' },
}

/**
 * The black & white palette: every fiord layer that carries colour is
 * overridden, because fiord's own colours are dark navy and would otherwise
 * show through a light page. Layers the dark palette deliberately leaves to
 * fiord (tunnels, aeroways, railways, piers, the z0-4 boundary) are listed
 * here for exactly that reason.
 *
 * Where fiord bakes alpha into the colour string (e.g.
 * `hsla(…,0.2)` on `highway_motorway_subtle`), the replacement sets
 * `line-opacity` explicitly — a solid hex would otherwise arrive at full
 * strength.
 */
export const PALETTE_MONO: Record<string, PalettePaint> = {
  background: { 'background-color': '#ffffff' },
  landcover_wood: { 'fill-color': '#eeeeee', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#f6f6f6', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#fafafa' },
  landcover_glacier: { 'fill-color': '#fafafa' },

  water: { 'fill-color': '#dddddd' },
  waterway: { 'line-color': '#bbbbbb' },
  building: { 'fill-color': '#d9d9d9', 'fill-opacity': 1 },

  highway_major_casing: { 'line-color': '#ffffff' },
  highway_major_inner: { 'line-color': '#111111' },
  highway_major_subtle: { 'line-color': '#111111', 'line-opacity': 0.6 },
  highway_motorway_casing: { 'line-color': '#ffffff' },
  highway_motorway_inner: { 'line-color': '#111111' },
  highway_motorway_subtle: { 'line-color': '#333333', 'line-opacity': 0.25 },
  highway_minor: { 'line-color': '#666666' },
  highway_path: { 'line-color': '#000000', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#cccccc' },
  tunnel_motorway_inner: { 'line-color': '#777777' },

  'aeroway-taxiway': { 'line-color': '#c0c0c0' },
  'aeroway-runway-casing': { 'line-color': '#c0c0c0' },
  'aeroway-runway': { 'line-color': '#c0c0c0' },
  'aeroway-area': { 'fill-color': '#e6e6e6' },
  road_area_pier: { 'fill-color': '#e0e0e0' },
  road_pier: { 'line-color': '#cccccc' },

  railway_transit: { 'line-color': '#999999' },
  railway_transit_dashline: { 'line-color': '#c0c0c0' },
  railway_service: { 'line-color': '#999999' },
  railway_service_dashline: { 'line-color': '#c0c0c0' },
  railway: { 'line-color': '#888888' },
  railway_dashline: { 'line-color': '#b0b0b0' },

  boundary_state: { 'line-color': '#bbbbbb' },
  'boundary_country_z0-4': { 'line-color': '#999999' },
  'boundary_country_z5-': { 'line-color': '#999999' },
}

/**
 * The raw brutalist map: white paper, greys for water and land, pure-black
 * roads and boundaries, no colour anywhere. The blue of the overlay markers
 * is the only saturated pixel, exactly like the "unstyled" page it matches.
 */
export const PALETTE_BRUT: Record<string, PalettePaint> = {
  background: { 'background-color': '#ffffff' },
  landcover_wood: { 'fill-color': '#efefef', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#f5f5f5', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#fafafa' },
  landcover_glacier: { 'fill-color': '#fafafa' },

  water: { 'fill-color': '#d9d9d9' },
  waterway: { 'line-color': '#bdbdbd' },
  building: { 'fill-color': '#e2e2e2', 'fill-opacity': 1 },

  highway_major_casing: { 'line-color': '#ffffff' },
  highway_major_inner: { 'line-color': '#000000' },
  highway_major_subtle: { 'line-color': '#000000', 'line-opacity': 0.45 },
  highway_motorway_casing: { 'line-color': '#ffffff' },
  highway_motorway_inner: { 'line-color': '#000000' },
  highway_motorway_subtle: { 'line-color': '#333333', 'line-opacity': 0.3 },
  highway_minor: { 'line-color': '#222222' },
  highway_path: { 'line-color': '#000000', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#d4d4d4' },
  tunnel_motorway_inner: { 'line-color': '#8a8a8a' },

  'aeroway-taxiway': { 'line-color': '#c9c9c9' },
  'aeroway-runway-casing': { 'line-color': '#c9c9c9' },
  'aeroway-runway': { 'line-color': '#c9c9c9' },
  'aeroway-area': { 'fill-color': '#ededed' },
  road_area_pier: { 'fill-color': '#e8e8e8' },
  road_pier: { 'line-color': '#d4d4d4' },

  railway_transit: { 'line-color': '#a3a3a3' },
  railway_transit_dashline: { 'line-color': '#c9c9c9' },
  railway_service: { 'line-color': '#a3a3a3' },
  railway_service_dashline: { 'line-color': '#c9c9c9' },
  railway: { 'line-color': '#8a8a8a' },
  railway_dashline: { 'line-color': '#bdbdbd' },

  boundary_state: { 'line-color': '#888888' },
  'boundary_country_z0-4': { 'line-color': '#444444' },
  'boundary_country_z5-': { 'line-color': '#000000' },
}

/**
 * The neobrutalist map: warm cream paper, near-black ink for roads and
 * boundaries, pastel water — the same ink-on-paper rule the page uses, with
 * the saturated accent colours reserved for the site's own overlay layers.
 */
export const PALETTE_NEOBRUT: Record<string, PalettePaint> = {
  background: { 'background-color': '#f7ecd8' },
  landcover_wood: { 'fill-color': '#efe1c2', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#f1e4c8', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#f8efdd' },
  landcover_glacier: { 'fill-color': '#f8efdd' },

  water: { 'fill-color': '#a9cbe6' },
  waterway: { 'line-color': '#8fb6d6' },
  building: { 'fill-color': '#e5d0a8', 'fill-opacity': 1 },

  highway_major_casing: { 'line-color': '#f7ecd8' },
  highway_major_inner: { 'line-color': '#141414' },
  highway_major_subtle: { 'line-color': '#141414', 'line-opacity': 0.5 },
  highway_motorway_casing: { 'line-color': '#f7ecd8' },
  highway_motorway_inner: { 'line-color': '#000000' },
  highway_motorway_subtle: { 'line-color': '#333333', 'line-opacity': 0.3 },
  highway_minor: { 'line-color': '#2a2a2a' },
  highway_path: { 'line-color': '#000000', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#d4c4a4' },
  tunnel_motorway_inner: { 'line-color': '#84807a' },

  'aeroway-taxiway': { 'line-color': '#d9c9a8' },
  'aeroway-runway-casing': { 'line-color': '#d9c9a8' },
  'aeroway-runway': { 'line-color': '#d9c9a8' },
  'aeroway-area': { 'fill-color': '#ecdfc0' },
  road_area_pier: { 'fill-color': '#e0d3b2' },
  road_pier: { 'line-color': '#cfc1a0' },

  railway_transit: { 'line-color': '#aaa386' },
  railway_transit_dashline: { 'line-color': '#c5bda0' },
  railway_service: { 'line-color': '#aaa386' },
  railway_service_dashline: { 'line-color': '#c5bda0' },
  railway: { 'line-color': '#8f8870' },
  railway_dashline: { 'line-color': '#b8b097' },

  boundary_state: { 'line-color': '#9c8a55' },
  'boundary_country_z0-4': { 'line-color': '#6b5b34' },
  'boundary_country_z5-': { 'line-color': '#4a4030' },
}

/**
 * The nord map (arcticicestudio): Polar Night paper with the Frost blues on
 * water, roads and boundaries — cold and hushed, like a mountain logbook in
 * November.
 */
export const PALETTE_NORD: Record<string, PalettePaint> = {
  background: { 'background-color': '#2e3440' },
  landcover_wood: { 'fill-color': '#29313c', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#303845', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#3b4252' },
  landcover_glacier: { 'fill-color': '#3b4252' },

  water: { 'fill-color': '#5e81ac' },
  waterway: { 'line-color': '#81a1c1' },
  building: { 'fill-color': '#3b4252' },

  highway_major_casing: { 'line-color': '#2e3440' },
  highway_major_inner: { 'line-color': '#d8dee9' },
  highway_major_subtle: { 'line-color': '#d8dee9', 'line-opacity': 0.5 },
  highway_motorway_casing: { 'line-color': '#2e3440' },
  highway_motorway_inner: { 'line-color': '#eceff4' },
  highway_motorway_subtle: { 'line-color': '#eceff4', 'line-opacity': 0.4 },
  highway_minor: { 'line-color': '#81a1c1' },
  highway_path: { 'line-color': '#88c0d0', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#4c566a' },
  tunnel_motorway_inner: { 'line-color': '#7b88a1' },

  'aeroway-taxiway': { 'line-color': '#4c566a' },
  'aeroway-runway-casing': { 'line-color': '#4c566a' },
  'aeroway-runway': { 'line-color': '#4c566a' },
  'aeroway-area': { 'fill-color': '#3b4252' },
  road_area_pier: { 'fill-color': '#3b4252' },
  road_pier: { 'line-color': '#434c5e' },

  railway_transit: { 'line-color': '#5e81ac' },
  railway_transit_dashline: { 'line-color': '#5e81ac' },
  railway_service: { 'line-color': '#5e81ac' },
  railway_service_dashline: { 'line-color': '#5e81ac' },
  railway: { 'line-color': '#5e81ac' },
  railway_dashline: { 'line-color': '#5e81ac' },

  boundary_state: { 'line-color': '#5e81ac' },
  'boundary_country_z0-4': { 'line-color': '#4c566a' },
  'boundary_country_z5-': { 'line-color': '#88c0d0' },
}

/**
 * The gruvbox light map: warm sepia paper, tan water and ink amber paths —
 * the field-notes palette. Every colour is desaturated enough to feel like
 * pencil on old paper.
 */
export const PALETTE_GRUVBOX: Record<string, PalettePaint> = {
  background: { 'background-color': '#fbf1c7' },
  landcover_wood: { 'fill-color': '#ebdbb2', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#f2e5bc', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#f9f5d7' },
  landcover_glacier: { 'fill-color': '#f9f5d7' },

  water: { 'fill-color': '#a3b8a6' },
  waterway: { 'line-color': '#87978a' },
  building: { 'fill-color': '#e0d2ad', 'fill-opacity': 1 },

  highway_major_casing: { 'line-color': '#fbf1c7' },
  highway_major_inner: { 'line-color': '#3c3836' },
  highway_major_subtle: { 'line-color': '#3c3836', 'line-opacity': 0.5 },
  highway_motorway_casing: { 'line-color': '#fbf1c7' },
  highway_motorway_inner: { 'line-color': '#282828' },
  highway_motorway_subtle: { 'line-color': '#665c54', 'line-opacity': 0.35 },
  highway_minor: { 'line-color': '#665c54' },
  highway_path: { 'line-color': '#d79921', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#e5d8ab' },
  tunnel_motorway_inner: { 'line-color': '#a89984' },

  'aeroway-taxiway': { 'line-color': '#d5c4a1' },
  'aeroway-runway-casing': { 'line-color': '#d5c4a1' },
  'aeroway-runway': { 'line-color': '#d5c4a1' },
  'aeroway-area': { 'fill-color': '#ede0b8' },
  road_area_pier: { 'fill-color': '#ebddb2' },
  road_pier: { 'line-color': '#d5c4a1' },

  railway_transit: { 'line-color': '#bdae93' },
  railway_transit_dashline: { 'line-color': '#bdae93' },
  railway_service: { 'line-color': '#bdae93' },
  railway_service_dashline: { 'line-color': '#bdae93' },
  railway: { 'line-color': '#a89984' },
  railway_dashline: { 'line-color': '#bdae93' },

  boundary_state: { 'line-color': '#a89984' },
  'boundary_country_z0-4': { 'line-color': '#7c6f64' },
  'boundary_country_z5-': { 'line-color': '#504945' },
}

/**
 * The solarized map: base03 paper, cyan water, muted slate roads — the
 * palette's most legible pairings, with the amber path as the one warm mark.
 */
export const PALETTE_SOLARIZED: Record<string, PalettePaint> = {
  background: { 'background-color': '#002b36' },
  landcover_wood: { 'fill-color': '#06323e', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#0a3a46', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#073642' },
  landcover_glacier: { 'fill-color': '#073642' },

  water: { 'fill-color': '#2aa198' },
  waterway: { 'line-color': '#1f7a74' },
  building: { 'fill-color': '#073642' },

  highway_major_casing: { 'line-color': '#002b36' },
  highway_major_inner: { 'line-color': '#93a1a1' },
  highway_major_subtle: { 'line-color': '#93a1a1', 'line-opacity': 0.5 },
  highway_motorway_casing: { 'line-color': '#002b36' },
  highway_motorway_inner: { 'line-color': '#c8ccbd' },
  highway_motorway_subtle: { 'line-color': '#93a1a1', 'line-opacity': 0.4 },
  highway_minor: { 'line-color': '#586e75' },
  highway_path: { 'line-color': '#b58900', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#0a4552' },
  tunnel_motorway_inner: { 'line-color': '#586e75' },

  'aeroway-taxiway': { 'line-color': '#0a4a56' },
  'aeroway-runway-casing': { 'line-color': '#0a4a56' },
  'aeroway-runway': { 'line-color': '#0a4a56' },
  'aeroway-area': { 'fill-color': '#08333e' },
  road_area_pier: { 'fill-color': '#073642' },
  road_pier: { 'line-color': '#0a4552' },

  railway_transit: { 'line-color': '#586e75' },
  railway_transit_dashline: { 'line-color': '#586e75' },
  railway_service: { 'line-color': '#586e75' },
  railway_service_dashline: { 'line-color': '#586e75' },
  railway: { 'line-color': '#475f66' },
  railway_dashline: { 'line-color': '#586e75' },

  boundary_state: { 'line-color': '#586e75' },
  'boundary_country_z0-4': { 'line-color': '#657b83' },
  'boundary_country_z5-': { 'line-color': '#93a1a1' },
}

/**
 * The catppuccin Mocha map: lavender-tinted paper, pastel blue water, soft
 * mint-green paths. The site's own overlay dots go hot pink — the one mark
 * in the family brave enough to be unapologetically bright.
 */
export const PALETTE_CATPPUCCIN: Record<string, PalettePaint> = {
  background: { 'background-color': '#1e1e2e' },
  landcover_wood: { 'fill-color': '#262638', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#2d2d42', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#313244' },
  landcover_glacier: { 'fill-color': '#313244' },

  water: { 'fill-color': '#89b4fa' },
  waterway: { 'line-color': '#74c7ec' },
  building: { 'fill-color': '#313244' },

  highway_major_casing: { 'line-color': '#1e1e2e' },
  highway_major_inner: { 'line-color': '#cdd6f4' },
  highway_major_subtle: { 'line-color': '#cdd6f4', 'line-opacity': 0.5 },
  highway_motorway_casing: { 'line-color': '#1e1e2e' },
  highway_motorway_inner: { 'line-color': '#e6e9f5' },
  highway_motorway_subtle: { 'line-color': '#cdd6f4', 'line-opacity': 0.4 },
  highway_minor: { 'line-color': '#a6adc8' },
  highway_path: { 'line-color': '#a6e3a1', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#181825' },
  tunnel_motorway_inner: { 'line-color': '#7f849c' },

  'aeroway-taxiway': { 'line-color': '#6c7086' },
  'aeroway-runway-casing': { 'line-color': '#6c7086' },
  'aeroway-runway': { 'line-color': '#6c7086' },
  'aeroway-area': { 'fill-color': '#2a2a41' },
  road_area_pier: { 'fill-color': '#2c2c44' },
  road_pier: { 'line-color': '#45475a' },

  railway_transit: { 'line-color': '#6c7086' },
  railway_transit_dashline: { 'line-color': '#6c7086' },
  railway_service: { 'line-color': '#6c7086' },
  railway_service_dashline: { 'line-color': '#6c7086' },
  railway: { 'line-color': '#585b70' },
  railway_dashline: { 'line-color': '#6c7086' },

  boundary_state: { 'line-color': '#6c7086' },
  'boundary_country_z0-4': { 'line-color': '#585b70' },
  'boundary_country_z5-': { 'line-color': '#8b90b0' },
}

/**
 * The phosphor map: P1 green on near-black raster. Everything is a dimmed or
 * brightened phosphor green — water, road and boundary differ by luminance
 * rather than hue, exactly like a monochrome scan.
 */
export const PALETTE_PHOSPHOR: Record<string, PalettePaint> = {
  background: { 'background-color': '#0a0f0a' },
  landcover_wood: { 'fill-color': '#0c140c', 'fill-opacity': 1 },
  landuse_residential: { 'fill-color': '#0e170e', 'fill-opacity': 1 },
  landcover_ice_shelf: { 'fill-color': '#101a10' },
  landcover_glacier: { 'fill-color': '#101a10' },

  water: { 'fill-color': '#1a4a25' },
  waterway: { 'line-color': '#2d6e35' },
  building: { 'fill-color': '#14281a' },

  highway_major_casing: { 'line-color': '#0a0f0a' },
  highway_major_inner: { 'line-color': '#7cfc00' },
  highway_major_subtle: { 'line-color': '#7cfc00', 'line-opacity': 0.45 },
  highway_motorway_casing: { 'line-color': '#0a0f0a' },
  highway_motorway_inner: { 'line-color': '#b5ff6b' },
  highway_motorway_subtle: { 'line-color': '#7cfc00', 'line-opacity': 0.35 },
  highway_minor: { 'line-color': '#4c8f40' },
  highway_path: { 'line-color': '#7cfc00', 'line-dasharray': [1.5, 1.5] },

  tunnel_motorway_casing: { 'line-color': '#101a10' },
  tunnel_motorway_inner: { 'line-color': '#2c4a2c' },

  'aeroway-taxiway': { 'line-color': '#2c4a2c' },
  'aeroway-runway-casing': { 'line-color': '#2c4a2c' },
  'aeroway-runway': { 'line-color': '#2c4a2c' },
  'aeroway-area': { 'fill-color': '#121f12' },
  road_area_pier: { 'fill-color': '#132213' },
  road_pier: { 'line-color': '#1e3a1e' },

  railway_transit: { 'line-color': '#2c4a2c' },
  railway_transit_dashline: { 'line-color': '#2c4a2c' },
  railway_service: { 'line-color': '#2c4a2c' },
  railway_service_dashline: { 'line-color': '#2c4a2c' },
  railway: { 'line-color': '#27421f' },
  railway_dashline: { 'line-color': '#2c4a2c' },

  boundary_state: { 'line-color': '#3a6b3a' },
  'boundary_country_z0-4': { 'line-color': '#3a6b3a' },
  'boundary_country_z5-': { 'line-color': '#d4ffd4' },
}

/** Layers the palette switches off entirely (the green park fills clash). */
export const HIDDEN_LAYERS = ['park', 'park_outline'] as const

/** Map labels, recoloured to sit legibly on the dark background. */
export const LABEL_LAYERS = [
  'place_city_large',
  'place_city',
  'place_town',
  'place_village',
  'place_suburb',
  'place_other',
  'highway_name_other',
  'highway_name_motorway',
  'water_name',
] as const

export const LABEL_TEXT: PalettePaint = {
  'text-color': '#d4f0d4',
  'text-halo-color': '#0e120b',
  'text-halo-width': 1.5,
}

/**
 * Every light-paper theme needs a wider label sweep than the dark palette:
 * fiord's own colours for `place_state`, the country/continent names and
 * `highway_ref` are pale blues meant for a navy background, so they must be
 * re-inked or they wash out on white (and on neobrut's cream).
 */
export const MONO_LABEL_LAYERS = [
  ...LABEL_LAYERS,
  'highway_ref',
  'place_state',
  'place_country_other',
  'place_country_minor',
  'place_country_major',
  'place_continent',
] as const

export const MONO_LABEL_TEXT: PalettePaint = {
  'text-color': '#1a1a1a',
  'text-halo-color': '#ffffff',
  'text-halo-width': 1.5,
}

export const BRUT_LABEL_TEXT: PalettePaint = {
  'text-color': '#000000',
  'text-halo-color': '#ffffff',
  'text-halo-width': 1.5,
}

export const NEOBRUT_LABEL_TEXT: PalettePaint = {
  'text-color': '#2a2416',
  'text-halo-color': '#f7ecd8',
  'text-halo-width': 1.5,
}

export const NORD_LABEL_TEXT: PalettePaint = {
  'text-color': '#d8dee9',
  'text-halo-color': '#2e3440',
  'text-halo-width': 1.5,
}

export const GRUVBOX_LABEL_TEXT: PalettePaint = {
  'text-color': '#3c3836',
  'text-halo-color': '#fbf1c7',
  'text-halo-width': 1.5,
}

export const SOLARIZED_LABEL_TEXT: PalettePaint = {
  'text-color': '#93a1a1',
  'text-halo-color': '#002b36',
  'text-halo-width': 1.5,
}

export const CATPPUCCIN_LABEL_TEXT: PalettePaint = {
  'text-color': '#cdd6f4',
  'text-halo-color': '#1e1e2e',
  'text-halo-width': 1.5,
}

export const PHOSPHOR_LABEL_TEXT: PalettePaint = {
  'text-color': '#d4ffd4',
  'text-halo-color': '#0a0f0a',
  'text-halo-width': 1.5,
}

/**
 * Colours for the layers this site adds on top of fiord, per theme. Only
 * colour-ish paint properties live here — radii, dashes and text sizes stay
 * with the `addLayer` call that owns them, so re-applying a palette can never
 * disturb geometry.
 */
const OVERLAY_TUI: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#141414' },
  'box-mask-outline': { 'line-color': '#4a6a4a' },
  'mini-mask-fill': { 'fill-color': '#141414' },
  'mini-mask-outline': { 'line-color': '#4a6a4a' },
  'mini-region-fill': { 'fill-color': '#33ff33' },
  'mini-region-line': { 'line-color': '#33ff33' },
  'sighting-dot': { 'circle-color': '#33ff33', 'circle-stroke-color': '#0e120b' },
  'sighting-cluster': { 'circle-color': '#33ff33', 'circle-stroke-color': '#0e120b' },
  'sighting-cluster-count': { 'text-color': '#0e120b', 'text-halo-color': '#33ff33' },
  'sighting-label': { 'text-color': '#33ff33', 'text-halo-color': '#0e120b' },
  'hiking-peak': { 'text-color': '#d4f0d4', 'text-halo-color': '#0e120b' },
  'hiking-poi': { 'text-color': '#8fbf8f', 'text-halo-color': '#0e120b' },
  'hiking-trail-label': { 'text-color': '#33ff33', 'text-halo-color': '#0e120b' },
  'hiking-contour-minor': { 'line-color': '#3a4a35' },
  'hiking-contour-major': { 'line-color': '#5a6c52' },
}

const OVERLAY_MONO: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#ffffff' },
  'box-mask-outline': { 'line-color': '#cccccc' },
  'mini-mask-fill': { 'fill-color': '#ffffff' },
  'mini-mask-outline': { 'line-color': '#cccccc' },
  // Opacity props set at addLayer time (0.1 fill, 0.85 line) still apply, so
  // these ink values arrive as the intended faint/dashed grays.
  'mini-region-fill': { 'fill-color': '#000000' },
  'mini-region-line': { 'line-color': '#000000' },
  'sighting-dot': { 'circle-color': '#000000', 'circle-stroke-color': '#ffffff' },
  'sighting-cluster': { 'circle-color': '#000000', 'circle-stroke-color': '#ffffff' },
  'sighting-cluster-count': { 'text-color': '#ffffff', 'text-halo-color': '#000000' },
  'sighting-label': { 'text-color': '#000000', 'text-halo-color': '#ffffff' },
  'hiking-peak': { 'text-color': '#000000', 'text-halo-color': '#ffffff' },
  'hiking-poi': { 'text-color': '#333333', 'text-halo-color': '#ffffff' },
  'hiking-trail-label': { 'text-color': '#000000', 'text-halo-color': '#ffffff' },
  'hiking-contour-minor': { 'line-color': '#dddddd' },
  'hiking-contour-major': { 'line-color': '#bbbbbb' },
}

/**
 * Brutalist overlays: the default-link blue (`#0000ee` on the page) marks
 * every sighting, and ink-on-white does the rest — clusters and labels read
 * like a stark printout.
 */
const OVERLAY_BRUT: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#f2f2f2' },
  'box-mask-outline': { 'line-color': '#000000' },
  'mini-mask-fill': { 'fill-color': '#f2f2f2' },
  'mini-mask-outline': { 'line-color': '#000000' },
  'mini-region-fill': { 'fill-color': '#0000ee' },
  'mini-region-line': { 'line-color': '#0000ee' },
  'sighting-dot': { 'circle-color': '#0000ee', 'circle-stroke-color': '#ffffff' },
  'sighting-cluster': { 'circle-color': '#000000', 'circle-stroke-color': '#ffffff' },
  'sighting-cluster-count': { 'text-color': '#ffffff', 'text-halo-color': '#000000' },
  'sighting-label': { 'text-color': '#0000ee', 'text-halo-color': '#ffffff' },
  'hiking-peak': { 'text-color': '#000000', 'text-halo-color': '#ffffff' },
  'hiking-poi': { 'text-color': '#4d4d4d', 'text-halo-color': '#ffffff' },
  'hiking-trail-label': { 'text-color': '#0000ee', 'text-halo-color': '#ffffff' },
  'hiking-contour-minor': { 'line-color': '#b5b5b5' },
  'hiking-contour-major': { 'line-color': '#8a8a8a' },
}

/**
 * Neobrutalist overlays: saturated fills with ink on top — the signal-yellow
 * clusters and hot-pink markers against cream, the same ink-on-fill pairing
 * the page's buttons use.
 */
const OVERLAY_NEOBRUT: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#f6edda' },
  'box-mask-outline': { 'line-color': '#000000' },
  'mini-mask-fill': { 'fill-color': '#f6edda' },
  'mini-mask-outline': { 'line-color': '#000000' },
  'mini-region-fill': { 'fill-color': '#ffde00' },
  'mini-region-line': { 'line-color': '#000000' },
  'sighting-dot': { 'circle-color': '#ff5ca8', 'circle-stroke-color': '#000000' },
  'sighting-cluster': { 'circle-color': '#ffde00', 'circle-stroke-color': '#000000' },
  'sighting-cluster-count': { 'text-color': '#141414', 'text-halo-color': '#ffde00' },
  'sighting-label': { 'text-color': '#141414', 'text-halo-color': '#f6edda' },
  'hiking-peak': { 'text-color': '#ff6b35', 'text-halo-color': '#f6edda' },
  'hiking-poi': { 'text-color': '#6b634f', 'text-halo-color': '#f6edda' },
  'hiking-trail-label': { 'text-color': '#141414', 'text-halo-color': '#f6edda' },
  'hiking-contour-minor': { 'line-color': '#dcc9a2' },
  'hiking-contour-major': { 'line-color': '#bfa67c' },
}

const OVERLAY_NORD: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#2e3440' },
  'box-mask-outline': { 'line-color': '#5e81ac' },
  'mini-mask-fill': { 'fill-color': '#2e3440' },
  'mini-mask-outline': { 'line-color': '#5e81ac' },
  'mini-region-fill': { 'fill-color': '#88c0d0' },
  'mini-region-line': { 'line-color': '#88c0d0' },
  'sighting-dot': { 'circle-color': '#88c0d0', 'circle-stroke-color': '#2e3440' },
  'sighting-cluster': { 'circle-color': '#88c0d0', 'circle-stroke-color': '#2e3440' },
  'sighting-cluster-count': { 'text-color': '#2e3440', 'text-halo-color': '#88c0d0' },
  'sighting-label': { 'text-color': '#88c0d0', 'text-halo-color': '#2e3440' },
  'hiking-peak': { 'text-color': '#d8dee9', 'text-halo-color': '#2e3440' },
  'hiking-poi': { 'text-color': '#81a1c1', 'text-halo-color': '#2e3440' },
  'hiking-trail-label': { 'text-color': '#88c0d0', 'text-halo-color': '#2e3440' },
  'hiking-contour-minor': { 'line-color': '#4a5a74' },
  'hiking-contour-major': { 'line-color': '#6d7f9a' },
}

const OVERLAY_GRUVBOX: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#fbf1c7' },
  'box-mask-outline': { 'line-color': '#504945' },
  'mini-mask-fill': { 'fill-color': '#fbf1c7' },
  'mini-mask-outline': { 'line-color': '#504945' },
  'mini-region-fill': { 'fill-color': '#b57614' },
  'mini-region-line': { 'line-color': '#b57614' },
  'sighting-dot': { 'circle-color': '#b57614', 'circle-stroke-color': '#fbf1c7' },
  'sighting-cluster': { 'circle-color': '#d79921', 'circle-stroke-color': '#fbf1c7' },
  'sighting-cluster-count': { 'text-color': '#282828', 'text-halo-color': '#d79921' },
  'sighting-label': { 'text-color': '#b57614', 'text-halo-color': '#fbf1c7' },
  'hiking-peak': { 'text-color': '#282828', 'text-halo-color': '#fbf1c7' },
  'hiking-poi': { 'text-color': '#504945', 'text-halo-color': '#fbf1c7' },
  'hiking-trail-label': { 'text-color': '#b57614', 'text-halo-color': '#fbf1c7' },
  'hiking-contour-minor': { 'line-color': '#e0d2a5' },
  'hiking-contour-major': { 'line-color': '#c6b084' },
}

const OVERLAY_SOLARIZED: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#002b36' },
  'box-mask-outline': { 'line-color': '#657b83' },
  'mini-mask-fill': { 'fill-color': '#002b36' },
  'mini-mask-outline': { 'line-color': '#657b83' },
  'mini-region-fill': { 'fill-color': '#2aa198' },
  'mini-region-line': { 'line-color': '#2aa198' },
  'sighting-dot': { 'circle-color': '#2aa198', 'circle-stroke-color': '#002b36' },
  'sighting-cluster': { 'circle-color': '#2aa198', 'circle-stroke-color': '#002b36' },
  'sighting-cluster-count': { 'text-color': '#002b36', 'text-halo-color': '#2aa198' },
  'sighting-label': { 'text-color': '#2aa198', 'text-halo-color': '#002b36' },
  'hiking-peak': { 'text-color': '#93a1a1', 'text-halo-color': '#002b36' },
  'hiking-poi': { 'text-color': '#657b83', 'text-halo-color': '#002b36' },
  'hiking-trail-label': { 'text-color': '#2aa198', 'text-halo-color': '#002b36' },
  'hiking-contour-minor': { 'line-color': '#0f5a50' },
  'hiking-contour-major': { 'line-color': '#177269' },
}

const OVERLAY_CATPPUCCIN: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#1e1e2e' },
  'box-mask-outline': { 'line-color': '#6c7086' },
  'mini-mask-fill': { 'fill-color': '#1e1e2e' },
  'mini-mask-outline': { 'line-color': '#6c7086' },
  'mini-region-fill': { 'fill-color': '#a6e3a1' },
  'mini-region-line': { 'line-color': '#a6e3a1' },
  'sighting-dot': { 'circle-color': '#f5c2e7', 'circle-stroke-color': '#1e1e2e' },
  'sighting-cluster': { 'circle-color': '#b4befe', 'circle-stroke-color': '#1e1e2e' },
  'sighting-cluster-count': { 'text-color': '#1e1e2e', 'text-halo-color': '#b4befe' },
  'sighting-label': { 'text-color': '#b4befe', 'text-halo-color': '#1e1e2e' },
  'hiking-peak': { 'text-color': '#cdd6f4', 'text-halo-color': '#1e1e2e' },
  'hiking-poi': { 'text-color': '#a6adc8', 'text-halo-color': '#1e1e2e' },
  'hiking-trail-label': { 'text-color': '#94e2d5', 'text-halo-color': '#1e1e2e' },
  'hiking-contour-minor': { 'line-color': '#313244' },
  'hiking-contour-major': { 'line-color': '#45475a' },
}

const OVERLAY_PHOSPHOR: Record<string, PalettePaint> = {
  'box-mask-fill': { 'fill-color': '#0a0f0a' },
  'box-mask-outline': { 'line-color': '#3a6b3a' },
  'mini-mask-fill': { 'fill-color': '#0a0f0a' },
  'mini-mask-outline': { 'line-color': '#3a6b3a' },
  'mini-region-fill': { 'fill-color': '#7cfc00' },
  'mini-region-line': { 'line-color': '#7cfc00' },
  'sighting-dot': { 'circle-color': '#7cfc00', 'circle-stroke-color': '#0a0f0a' },
  'sighting-cluster': { 'circle-color': '#7cfc00', 'circle-stroke-color': '#0a0f0a' },
  'sighting-cluster-count': { 'text-color': '#0a0f0a', 'text-halo-color': '#7cfc00' },
  'sighting-label': { 'text-color': '#7cfc00', 'text-halo-color': '#0a0f0a' },
  'hiking-peak': { 'text-color': '#d4ffd4', 'text-halo-color': '#0a0f0a' },
  'hiking-poi': { 'text-color': '#8fbf8f', 'text-halo-color': '#0a0f0a' },
  'hiking-trail-label': { 'text-color': '#7cfc00', 'text-halo-color': '#0a0f0a' },
  'hiking-contour-minor': { 'line-color': '#1e3a1e' },
  'hiking-contour-major': { 'line-color': '#2c5a30' },
}

export const BASE_PALETTES: Record<ThemeName, Record<string, PalettePaint>> = {
  tui: PALETTE,
  mono: PALETTE_MONO,
  brut: PALETTE_BRUT,
  neobrut: PALETTE_NEOBRUT,
  nord: PALETTE_NORD,
  gruvbox: PALETTE_GRUVBOX,
  solarized: PALETTE_SOLARIZED,
  catppuccin: PALETTE_CATPPUCCIN,
  phosphor: PALETTE_PHOSPHOR,
}

export const LABEL_RECORDS: Record<ThemeName, { layers: readonly string[]; text: PalettePaint }> = {
  tui: { layers: LABEL_LAYERS, text: LABEL_TEXT },
  mono: { layers: MONO_LABEL_LAYERS, text: MONO_LABEL_TEXT },
  brut: { layers: MONO_LABEL_LAYERS, text: BRUT_LABEL_TEXT },
  neobrut: { layers: MONO_LABEL_LAYERS, text: NEOBRUT_LABEL_TEXT },
  nord: { layers: LABEL_LAYERS, text: NORD_LABEL_TEXT },
  gruvbox: { layers: MONO_LABEL_LAYERS, text: GRUVBOX_LABEL_TEXT },
  solarized: { layers: LABEL_LAYERS, text: SOLARIZED_LABEL_TEXT },
  catppuccin: { layers: LABEL_LAYERS, text: CATPPUCCIN_LABEL_TEXT },
  phosphor: { layers: LABEL_LAYERS, text: PHOSPHOR_LABEL_TEXT },
}

export const OVERLAY_RECORDS: Record<ThemeName, Record<string, PalettePaint>> = {
  tui: OVERLAY_TUI,
  mono: OVERLAY_MONO,
  brut: OVERLAY_BRUT,
  neobrut: OVERLAY_NEOBRUT,
  nord: OVERLAY_NORD,
  gruvbox: OVERLAY_GRUVBOX,
  solarized: OVERLAY_SOLARIZED,
  catppuccin: OVERLAY_CATPPUCCIN,
  phosphor: OVERLAY_PHOSPHOR,
}

export const THEME_NAMES: readonly ThemeName[] = [
  'tui',
  'mono',
  'brut',
  'neobrut',
  'nord',
  'gruvbox',
  'solarized',
  'catppuccin',
  'phosphor',
]

/** The theme the page is currently wearing (unknown values render tui). */
export function currentTheme(): ThemeName {
  const t = document.documentElement.dataset.theme
  return (THEME_NAMES as readonly string[]).includes(t ?? '') ? (t as ThemeName) : 'tui'
}

/**
 * The baked per-theme style JSON — a committed snapshot regenerated by
 * `npm run update-map-themes`, served verbatim from `public/`. The map loads
 * it in its constructor and swaps it wholesale on a theme change; no paint
 * property is ever mutated after load. The JSON lives at a stable URL so
 * `map.setStyle()` can point at it directly.
 */
export function themeStyleUrl(theme: ThemeName = currentTheme()): string {
  return `/map-themes/${theme}.json`
}

/**
 * The overlay paint table a baked style carries in its `metadata`. The site's
 * own layers (masks, markers, clusters, hiking additions) are added after the
 * base style exists, so their themes cannot be baked into the style's layer
 * list — the table travels with the style instead and the `addLayer` calls
 * read from it, which is still "data, not mutation".
 */
export function overlayPaints(map: maplibregl.Map): Record<string, PalettePaint> {
  const table = (map.getStyle().metadata as { mycoOverlays?: unknown } | undefined)?.mycoOverlays
  return table && typeof table === 'object' ? (table as Record<string, PalettePaint>) : {}
}

/**
 * A layer's complete paint: the geometry/opacity defaults that belong to the
 * `addLayer` call (radii, widths, dashes, opacities) plus the theme's
 * colour values from the overlay table. Keeps colour and shape in the same
 * place as before — the defaults are the "several themes share this" part,
 * the table only ever carries colour. `base` is typed `unknown` so
 * data-driven expression literals (`['step', ['get', 'point_count'], 14, …]`)
 * are inferred rather than checked against the wide palette record.
 */
export function overlayPaint(
  table: Record<string, PalettePaint>,
  layer: string,
  base: Record<string, unknown> = {},
): PalettePaint {
  return { ...base, ...(table[layer] ?? {}) } as PalettePaint
}
