import type * as maplibregl from 'maplibre-gl'

/**
 * Dark terrain palette layered on top of the OpenFreeMap `fiord` style.
 *
 * Single source of truth: the live maps (`MiniMap`, `MapVector`) apply it via
 * `applyPalette()`, and `scripts/generate-thumbnails.mjs` bakes the same record
 * into a style object so build-time thumbnails match the interactive maps.
 *
 * Layer ids belong to the `fiord` style and are not stable across style
 * versions — `landcover_glacier` is absent in the current one. Every consumer
 * must skip missing layers rather than assume they exist.
 */
export type PalettePaint = Record<string, string | number | number[]>

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
 * Applies {@link PALETTE}, recolours {@link LABEL_LAYERS} and hides
 * {@link HIDDEN_LAYERS} on a live map.
 *
 * v6 narrowed `setPaintProperty` to `keyof AllPaintProperties` and dropped its
 * implicit value type. Both key and value are derived from the method signature
 * so we don't need the (transitive) style-spec package just to name the types.
 */
export function applyPalette(map: maplibregl.Map): void {
  type PaintKey = Parameters<maplibregl.Map['setPaintProperty']>[1]
  type PaintValue = Parameters<maplibregl.Map['setPaintProperty']>[2]

  const paint = (layer: string, props: PalettePaint) => {
    if (!map.getLayer(layer)) return
    for (const [k, v] of Object.entries(props)) {
      map.setPaintProperty(layer, k as PaintKey, v as PaintValue)
    }
  }

  for (const [layer, props] of Object.entries(PALETTE)) paint(layer, props)
  for (const layer of LABEL_LAYERS) paint(layer, LABEL_TEXT)

  for (const layer of HIDDEN_LAYERS) {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', 'none')
  }
}
