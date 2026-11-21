import type { GrabbableKind } from './grabbableRegistry';

const BASE = import.meta.env.BASE_URL;

/** GLB generados en Blender (ver art/blender/build_props.py). */
export const PROP_MODEL_URLS: Partial<Record<GrabbableKind, string>> = {
  crate: `${BASE}models/props/crate.glb`,
  canister: `${BASE}models/props/variants/barrel-v003.glb`,
  wheel: `${BASE}models/props/variants/wheel-v001.glb`,
  part: `${BASE}models/props/variants/engine-v001.glb`,
  battery: `${BASE}models/props/variants/battery-v001.glb`,
  woodBarrel: `${BASE}models/props/variants/wood_barrel-v001.glb`,
  wing: `${BASE}models/props/variants/wing-v001.glb`,
  headlight: `${BASE}models/props/variants/headlight-v001.glb`,
  seat: `${BASE}models/props/variants/seat-v001.glb`,
  thruster: `${BASE}models/props/variants/thruster-v001.glb`,
  chassis: `${BASE}models/props/variants/chassis-v001.glb`,
  cargoRack: `${BASE}models/props/variants/cargo_rack-v001.glb`,
  timerBox: `${BASE}models/props/variants/timer_box-v001.glb`,
  switchBox: `${BASE}models/props/variants/switch_box-v001.glb`,
  logicAnd: `${BASE}models/props/variants/logic_and-v001.glb`,
  magnet: `${BASE}models/props/variants/magnet-v001.glb`,
};

export const WORKSHOP_BARREL_MODELS = {
  teal: `${BASE}models/props/variants/barrel-v001.glb`,
  orange: `${BASE}models/props/variants/barrel-v002.glb`,
  rust: PROP_MODEL_URLS.canister!,
} as const;
export const WELDER_MODEL_URL = `${BASE}models/tools/welder.glb`;
export const GRINDER_MODEL_URL = `${BASE}models/tools/grinder.glb`;
export const WRENCH_MODEL_URL = `${BASE}models/props/variants/wrench-v001.glb`;

/** `?props=legacy` muestra las primitivas anteriores para comparar. */
export const USE_LEGACY_PROP_VISUALS =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('props') === 'legacy';
