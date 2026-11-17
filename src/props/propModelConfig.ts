const BASE = import.meta.env.BASE_URL;

/** GLB generados en Blender (ver art/blender/build_props.py). */
export const PROP_MODEL_URLS = {
  crate: `${BASE}models/props/crate.glb`,
  canister: `${BASE}models/props/barrel.glb`,
} as const;

/** `?props=legacy` muestra las primitivas anteriores para comparar. */
export const USE_LEGACY_PROP_VISUALS =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('props') === 'legacy';
