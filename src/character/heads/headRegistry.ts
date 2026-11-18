import { BASE_BODY_PROFILE, HEAD_OVERRIDE_LIMITS, type BodyProfile } from '../body/bodyProfile';
import type { HeadShapePreset } from '../faceRigController';

/**
 * Registro de cabezas intercambiables. Cada cabeza declara SOLO datos de su
 * propio modelo (dónde está su barbilla en espacio de modelo) y, si hace falta,
 * un ajuste acotado. La colocación sobre el cuello la calcula
 * `resolveHeadTransform` a partir del perfil del cuerpo, así ninguna cabeza
 * necesita offsets mágicos en el componente.
 *
 * Los GLB originales no se modifican.
 */
export interface HeadVariant {
  id: string;
  label: string;
  /** Modelo GLB de origen. */
  modelUrl: string;
  /** Forma morph de apariencia del modelo (si el GLB la soporta). */
  shapePreset: HeadShapePreset;
  /** Escala base del modelo para el tamaño de juego. */
  modelScale: number;
  /**
   * Altura (espacio de modelo, sin escalar) de la base del muñón de cuello de la
   * cabeza: el punto más bajo de la malla. Es lo que se une al cuello del cuerpo.
   */
  neckJoinModelY: number;
  /** Altura (espacio de modelo) del borde inferior de la barbilla visible, por forma. */
  chinFrontModelY: number;
  /** Ajuste opcional por variante, limitado por HEAD_OVERRIDE_LIMITS. */
  adjust?: { scale?: number; offset?: [number, number, number] };
}

const CABEZA_BASE_V002 = '/models/cabeza_base_v002.glb';

/** Medido en el GLB: Head.min.y = 0.690 (verificado en tests/characterBody.test.ts). */
const CABEZA_BASE_NECK_JOIN_Y = 0.69;
/** `chin_bottom` de face_rig.fit_by_shape en el GLB, por forma. */
const CABEZA_BASE_CHIN: Record<HeadShapePreset, number> = {
  base: 0.7526,
  round: 0.7541,
  long: 0.7551,
  wide: 0.7532,
};
const CABEZA_BASE_SCALE = 1.08;

export const HEAD_VARIANTS: Record<string, HeadVariant> = {
  base: {
    id: 'base',
    label: 'Base',
    modelUrl: CABEZA_BASE_V002,
    shapePreset: 'base',
    modelScale: CABEZA_BASE_SCALE,
    neckJoinModelY: CABEZA_BASE_NECK_JOIN_Y,
    chinFrontModelY: CABEZA_BASE_CHIN.base,
  },
  round: {
    id: 'round',
    label: 'Redonda',
    modelUrl: CABEZA_BASE_V002,
    shapePreset: 'round',
    modelScale: CABEZA_BASE_SCALE,
    neckJoinModelY: CABEZA_BASE_NECK_JOIN_Y,
    chinFrontModelY: CABEZA_BASE_CHIN.round,
  },
  long: {
    id: 'long',
    label: 'Alargada',
    modelUrl: CABEZA_BASE_V002,
    shapePreset: 'long',
    modelScale: CABEZA_BASE_SCALE,
    neckJoinModelY: CABEZA_BASE_NECK_JOIN_Y,
    chinFrontModelY: CABEZA_BASE_CHIN.long,
  },
  wide: {
    id: 'wide',
    label: 'Ancha',
    modelUrl: CABEZA_BASE_V002,
    shapePreset: 'wide',
    modelScale: CABEZA_BASE_SCALE,
    neckJoinModelY: CABEZA_BASE_NECK_JOIN_Y,
    chinFrontModelY: CABEZA_BASE_CHIN.wide,
  },
};

export const DEFAULT_HEAD_ID = 'base';

export function getHeadVariant(id: string | undefined): HeadVariant {
  return (id && HEAD_VARIANTS[id]) || HEAD_VARIANTS[DEFAULT_HEAD_ID];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface HeadTransform {
  /** Posición del pivote de cabeza en el grupo torso (= socket del cuello). */
  pivot: [number, number, number];
  /** Escala y offset del modelo dentro del pivote. */
  scale: number;
  offset: [number, number, number];
}

/**
 * Coloca cualquier cabeza sobre el socket del cuello: la base de su muñón de
 * cuello queda `neckJoinBelowPivot` por debajo del tope del cuello del cuerpo,
 * hundida en la tapa de hombros para que la unión nunca se vea.
 * Accesorios de cabeza (casco, gafas, pelo) usan esta misma transformación.
 */
export function resolveHeadTransform(
  variant: HeadVariant,
  profile: BodyProfile = BASE_BODY_PROFILE
): HeadTransform {
  const [sLo, sHi] = HEAD_OVERRIDE_LIMITS.scale;
  const lim = HEAD_OVERRIDE_LIMITS.offset;
  const scale = clamp(variant.modelScale * (variant.adjust?.scale ?? 1), sLo, sHi);
  const adj = variant.adjust?.offset ?? [0, 0, 0];
  const ax = clamp(adj[0], -lim, lim);
  const ay = clamp(adj[1], -lim, lim);
  const az = clamp(adj[2], -lim, lim);
  return {
    pivot: [0, profile.neck.top, profile.head.pivotZ],
    scale,
    offset: [ax, -profile.head.neckJoinBelowPivot - variant.neckJoinModelY * scale + ay, az],
  };
}

/** Lleva un punto en espacio de modelo de cabeza al espacio del pivote de cabeza. */
export function headModelToPivot(
  t: HeadTransform,
  x: number,
  y: number,
  z: number
): [number, number, number] {
  return [x * t.scale + t.offset[0], y * t.scale + t.offset[1], z * t.scale + t.offset[2]];
}
