import type { GrabbableKind } from './grabbableRegistry';

/**
 * Etiquetas físicas del mundo (ver docs/VISION_MVP.md, 3.1): reglas simples y reutilizables para que los
 * objetos del mapa respondan al imán, a la Sierra Láser (`4`) y a la Amoladora (`3`) sin código a medida.
 */
export interface PhysicalTags {
  /** El imán (`magnet`) lo levanta o lo arrastra. */
  isMagnetic?: boolean;
  /** La Sierra Láser puede rebanarlo y la Amoladora puede cortar su unión. */
  isCuttable?: boolean;
  /** Transmite energía (reservado para los cables: postes, rieles, carrocerías). */
  conductsPower?: boolean;
  /** Fuerza (N) que lo rompe o suelta su unión. Ver `weightMultiple` en `physics/jointLoad.ts`. */
  breakForce?: number;
}

/** Materiales que el imán no levanta (madera, goma, tela, cuero). Todo lo demás se considera metálico. */
const NON_MAGNETIC_KINDS: ReadonlySet<GrabbableKind> = new Set<GrabbableKind>([
  'woodBarrel',
  'balloon',
  'flag',
  'boxingGlove',
]);

const tagsById = new Map<string, PhysicalTags>();

/** Etiqueta un objeto por id. Devuelve una función para quitar la etiqueta. */
export function registerWorldTags(id: string, tags: PhysicalTags): () => void {
  tagsById.set(id, tags);
  return () => {
    if (tagsById.get(id) === tags) tagsById.delete(id);
  };
}

export function getWorldTags(id: string): PhysicalTags {
  return tagsById.get(id) ?? {};
}

/** La etiqueta registrada manda; si no hay, se decide por el tipo de pieza. */
export function isMagneticTarget(id: string, kind: GrabbableKind): boolean {
  return getWorldTags(id).isMagnetic ?? !NON_MAGNETIC_KINDS.has(kind);
}

export function isCuttableTarget(id: string, _kind: GrabbableKind): boolean {
  return getWorldTags(id).isCuttable ?? true;
}

export function conductsPowerTarget(id: string, kind: GrabbableKind): boolean {
  return getWorldTags(id).conductsPower ?? !NON_MAGNETIC_KINDS.has(kind);
}

/**
 * Poste o riel metálico fijo del mapa (`isMagnetic`): un imán encendido cerca se pega a su eje,
 * lo que permite trepar por él (escalada magnética).
 */
export interface MagneticAnchor {
  x: number;
  z: number;
  yMin: number;
  yMax: number;
  /** Distancia a la que el imán empieza a sentirlo (m). */
  range: number;
}

const anchors = new Map<string, MagneticAnchor>();

export function registerMagneticAnchor(id: string, anchor: MagneticAnchor): () => void {
  anchors.set(id, anchor);
  return () => {
    if (anchors.get(id) === anchor) anchors.delete(id);
  };
}

export function magneticAnchors(): ReadonlyMap<string, MagneticAnchor> {
  return anchors;
}
