import { Quaternion, Vector3 } from 'three';

/**
 * Sistema de carrocería modular liviana para Taller El Yunke (Los del Desguace).
 *
 * Objetivo:
 * - Permitir vestir cualquier chasis o plataforma con chapas, cuñas, ventanas y jaulas
 *   sin arruinar el peso ni la suspensión en Rapier (masas bajas: 0.26 - 0.42 kg).
 * - Ofrecer encastre automático por borde (edge-snap) a 0°, ±45° y ±90° para armar
 *   cabinas, trompas y techos rápidamente tanto en PC como en celular.
 * - Dar valor jugable real: protección con umbral de rotura (breakForce), vidrio que
 *   se raja/estalla antes de soltar el marco, compatibilidad con Aerosol y Sierra Láser,
 *   y un bonus aerodinámico acotado.
 */

export type BodyworkKind =
  | 'panel_flat'
  | 'panel_wedge'
  | 'window_frame'
  | 'roll_cage'
  | 'door_panel';

export type GlassState = 'intact' | 'cracked' | 'shattered';

export type BodyworkEdgeId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface BodyworkEdge {
  id: BodyworkEdgeId;
  /** Punto medio del borde en coordenadas locales de la pieza. */
  localPoint: readonly [number, number, number];
  /** Normal saliente del borde en coordenadas locales. */
  localNormal: readonly [number, number, number];
  /** Eje tangente a lo largo del borde (eje de bisagra para ángulos de snap). */
  localTangent: readonly [number, number, number];
}

export interface BodyworkSpec {
  kind: BodyworkKind;
  label: string;
  /** Dimensiones aproximadas [ancho X, alto Y, largo Z] en metros. */
  size: readonly [number, number, number];
  /** Masa liviana en Rapier para no lastrar el chasis. */
  mass: number;
  /** Umbral de fuerza/impulso para desprender la soldadura en choques fuertes. */
  breakForce: number;
  /** Si el vidrio puede rajarse/estallar independientemente del marco. */
  glassBreakImpulse?: number;
  /** Si la Sierra Láser (4) puede recortarla o hacerle muescas. */
  isCuttable: boolean;
  /** Si el Imán (magnet) puede adherirse a esta pieza. */
  isMagnetic: boolean;
  /** Si acepta pintura en Aerosol (fill y mano alzada). */
  paintable: boolean;
  /** Bonus aerodinámico (reducción de arrastre en carrera/vuelo). */
  aeroBonus: number;
  /** Ángulo máximo de apertura si actúa como puerta con bisagra. */
  hingeAngleMax?: number;
  /** Bordes válidos para encastre rápido (edge-snap). */
  edges: readonly BodyworkEdge[];
}

export interface BodyworkInstanceState {
  id: string;
  kind: BodyworkKind;
  glassState?: GlassState;
  /** Color base hexadecimal (integración con paintStore / Aerosol). */
  paintColor?: string;
}

/** Ángulos permitidos al rotar una pieza encastrada por borde (tecla R / botón girar). */
export const BODYWORK_SNAP_ANGLES: readonly number[] = [
  0,
  Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 4,
  -Math.PI / 2,
];

function boxEdges(w: number, h: number, d: number): readonly BodyworkEdge[] {
  const hx = w * 0.5;
  const hy = h * 0.5;
  const hz = d * 0.5;
  return [
    { id: 'front', localPoint: [0, 0, hz], localNormal: [0, 0, 1], localTangent: [1, 0, 0] },
    { id: 'back', localPoint: [0, 0, -hz], localNormal: [0, 0, -1], localTangent: [-1, 0, 0] },
    { id: 'right', localPoint: [hx, 0, 0], localNormal: [1, 0, 0], localTangent: [0, 0, -1] },
    { id: 'left', localPoint: [-hx, 0, 0], localNormal: [-1, 0, 0], localTangent: [0, 0, 1] },
    { id: 'top', localPoint: [0, hy, 0], localNormal: [0, 1, 0], localTangent: [1, 0, 0] },
    { id: 'bottom', localPoint: [0, -hy, 0], localNormal: [0, -1, 0], localTangent: [1, 0, 0] },
  ];
}

export const BODYWORK_SPECS: Record<BodyworkKind, BodyworkSpec> = {
  panel_flat: {
    kind: 'panel_flat',
    label: 'Chapa Plana',
    size: [1.0, 0.06, 0.8],
    mass: 0.28,
    breakForce: 950,
    isCuttable: true,
    isMagnetic: true,
    paintable: true,
    aeroBonus: 0.03,
    edges: boxEdges(1.0, 0.06, 0.8),
  },
  panel_wedge: {
    kind: 'panel_wedge',
    label: 'Chapa en Cuña',
    size: [1.0, 0.36, 0.8],
    mass: 0.26,
    breakForce: 900,
    isCuttable: true,
    isMagnetic: true,
    paintable: true,
    aeroBonus: 0.12,
    edges: boxEdges(1.0, 0.36, 0.8),
  },
  window_frame: {
    kind: 'window_frame',
    label: 'Ventana con Vidrio',
    size: [1.0, 0.68, 0.08],
    mass: 0.32,
    breakForce: 1100,
    glassBreakImpulse: 220,
    isCuttable: false,
    isMagnetic: true,
    paintable: true,
    aeroBonus: 0.06,
    edges: boxEdges(1.0, 0.68, 0.08),
  },
  roll_cage: {
    kind: 'roll_cage',
    label: 'Jaula Antivuelco',
    size: [1.1, 0.85, 1.1],
    mass: 0.42,
    breakForce: 2200,
    isCuttable: false,
    isMagnetic: true,
    paintable: true,
    aeroBonus: 0.0,
    edges: boxEdges(1.1, 0.85, 1.1),
  },
  door_panel: {
    kind: 'door_panel',
    label: 'Puerta de Chapa',
    size: [0.07, 0.68, 0.82],
    mass: 0.3,
    breakForce: 850,
    isCuttable: true,
    isMagnetic: true,
    paintable: true,
    aeroBonus: 0.04,
    hingeAngleMax: Math.PI * 0.55,
    edges: boxEdges(0.07, 0.68, 0.82),
  },
};

export function isBodyworkKind(value: string): value is BodyworkKind {
  return value in BODYWORK_SPECS;
}

export function createBodyworkState(id: string, kind: BodyworkKind, paintColor?: string): BodyworkInstanceState {
  const spec = BODYWORK_SPECS[kind];
  return {
    id,
    kind,
    glassState: spec.glassBreakImpulse ? 'intact' : undefined,
    paintColor,
  };
}

export interface HostSnapSurface {
  /** Posición mundial de la pieza anfitriona (chasis, plataforma u otra chapa). */
  worldPosition: Vector3;
  /** Rotación mundial de la pieza anfitriona. */
  worldRotation: Quaternion;
  /** Dimensiones aproximadas [X, Y, Z] de la pieza anfitriona para ubicar sus bordes. */
  hostSize: readonly [number, number, number];
}

export interface EdgeSnapResult {
  snapped: boolean;
  position: Vector3;
  rotation: Quaternion;
  hostEdge: BodyworkEdgeId;
  angleRad: number;
}

const _invHostRot = new Quaternion();
const _localHit = new Vector3();
const _edgePosWorld = new Vector3();
const _edgeNormalWorld = new Vector3();
const _edgeTangentWorld = new Vector3();
const _attachOffset = new Vector3();
const _tiltQuat = new Quaternion();
const _outRot = new Quaternion();

/**
 * Calcula el encastre por borde (edge-snap) de una pieza de carrocería contra un chasis
 * u otra chapa ya montada.
 *
 * Uso típico desde `interactResolution.ts` al apuntar con Llave Láser (1) o en mano:
 * - Si el punto del raycast cae cerca de un borde de la pieza anfitriona (`maxEdgeDistance`),
 *   alinea el borde trasero/inferior de la pieza nueva contra ese borde con el ángulo pedido
 *   (`0°`, `±45°`, `±90°`) sin solapamiento.
 */
export function computeBodyworkEdgeSnap(
  kind: BodyworkKind,
  host: HostSnapSurface,
  worldHitPoint: Vector3,
  snapAngleIndex = 0,
  maxEdgeDistance = 0.42,
): EdgeSnapResult | null {
  const spec = BODYWORK_SPECS[kind];
  const hostEdges = boxEdges(host.hostSize[0], host.hostSize[1], host.hostSize[2]);

  _invHostRot.copy(host.worldRotation).invert();
  _localHit.copy(worldHitPoint).sub(host.worldPosition).applyQuaternion(_invHostRot);

  // 1. Buscar el borde horizontal/vertical más cercano al punto apuntado
  let bestEdge: BodyworkEdge | null = null;
  let bestDistSq = maxEdgeDistance * maxEdgeDistance;

  for (const edge of hostEdges) {
    const dx = _localHit.x - edge.localPoint[0];
    const dy = _localHit.y - edge.localPoint[1];
    const dz = _localHit.z - edge.localPoint[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestEdge = edge;
    }
  }

  if (!bestEdge) return null;

  // 2. Transformar el borde elegido a espacio mundial
  _edgePosWorld
    .set(bestEdge.localPoint[0], bestEdge.localPoint[1], bestEdge.localPoint[2])
    .applyQuaternion(host.worldRotation)
    .add(host.worldPosition);

  _edgeNormalWorld
    .set(bestEdge.localNormal[0], bestEdge.localNormal[1], bestEdge.localNormal[2])
    .applyQuaternion(host.worldRotation)
    .normalize();

  _edgeTangentWorld
    .set(bestEdge.localTangent[0], bestEdge.localTangent[1], bestEdge.localTangent[2])
    .applyQuaternion(host.worldRotation)
    .normalize();

  // 3. Aplicar rotación de snap alrededor del eje tangente del borde (0°, ±45°, ±90°)
  const normIdx =
    ((snapAngleIndex % BODYWORK_SNAP_ANGLES.length) + BODYWORK_SNAP_ANGLES.length) %
    BODYWORK_SNAP_ANGLES.length;
  const angleRad = BODYWORK_SNAP_ANGLES[normIdx];

  _tiltQuat.setFromAxisAngle(_edgeTangentWorld, angleRad);
  _outRot.copy(_tiltQuat).multiply(host.worldRotation).normalize();

  // 4. Desplazar el centro de la pieza nueva media dimensión hacia afuera de la normal
  //    para que su borde quede pegado al borde anfitrión sin interpenetrar.
  const halfExtent =
    bestEdge.id === 'left' || bestEdge.id === 'right'
      ? spec.size[0] * 0.5
      : bestEdge.id === 'top' || bestEdge.id === 'bottom'
        ? spec.size[1] * 0.5
        : spec.size[2] * 0.5;

  const outwardDir = _attachOffset.copy(_edgeNormalWorld).applyQuaternion(_tiltQuat).normalize();
  const finalPos = _edgePosWorld.clone().addScaledVector(outwardDir, halfExtent + 0.005);

  return {
    snapped: true,
    position: finalPos,
    rotation: _outRot.clone(),
    hostEdge: bestEdge.id,
    angleRad,
  };
}

export interface GlassImpactOutcome {
  nextState: GlassState;
  changed: boolean;
  /** Disparar sonido y partículas de vidrio astillado. */
  spawnShards: boolean;
}

/**
 * Evalúa el impacto sobre una ventana con vidrio (`window_frame`).
 * El vidrio se raja al 55% de `glassBreakImpulse` y estalla al 100%,
 * absorbiendo parte del golpe antes de que ceda el marco metálico.
 */
export function evaluateGlassImpact(
  kind: BodyworkKind,
  currentState: GlassState | undefined,
  impactImpulse: number,
): GlassImpactOutcome {
  const threshold = BODYWORK_SPECS[kind].glassBreakImpulse;
  if (!threshold || !currentState || currentState === 'shattered') {
    return { nextState: currentState ?? 'intact', changed: false, spawnShards: false };
  }

  if (impactImpulse >= threshold) {
    return { nextState: 'shattered', changed: true, spawnShards: true };
  }

  if (currentState === 'intact' && impactImpulse >= threshold * 0.55) {
    return { nextState: 'cracked', changed: true, spawnShards: false };
  }

  return { nextState: currentState, changed: false, spawnShards: false };
}

/**
 * Calcula un bonus aerodinámico acotado (0 a 0.35) a partir de las piezas de carrocería montadas.
 * Sirve para premiar diseños con trompa en cuña y cabina cerrada en pista o vuelo sin romper balance.
 */
export function computeAeroBonus(kinds: readonly BodyworkKind[]): number {
  let sum = 0;
  for (const kind of kinds) {
    sum += BODYWORK_SPECS[kind].aeroBonus;
  }
  return Math.min(0.35, sum);
}
// ---------- Integración con el taller ----------

/** Orden y nombres de las variantes en el Dispensador. */
export const BODYWORK_KINDS: readonly BodyworkKind[] = ['panel_flat', 'panel_wedge', 'window_frame', 'door_panel', 'roll_cage'];

/** Las piezas de carrocería son un solo tipo de pieza (`bodywork`); la variante va en el id. */
export function bodyworkId(kind: BodyworkKind, n: number): string {
  return `extra-bodywork-${kind}-${n}`;
}

export function bodyworkKindFromId(id: string | null | undefined): BodyworkKind | null {
  if (!id) return null;
  const m = /bodywork-([a-z_]+)-\d+$/.exec(id);
  return m && isBodyworkKind(m[1]) ? m[1] : null;
}

/** Media dimensión del collider (cuboide) de cada variante. */
export function bodyworkHalfExtents(kind: BodyworkKind): [number, number, number] {
  const [x, y, z] = BODYWORK_SPECS[kind].size;
  return [x / 2, y / 2, z / 2];
}

// Estado de vidrio y ángulo de encastre (en memoria; se reinicia al recargar).
const glass = new Map<string, GlassState>();
const glassListeners = new Set<() => void>();
let snapAngleIndex = 0;

export const bodyworkStore = {
  glassOf(id: string): GlassState | undefined {
    const kind = bodyworkKindFromId(id);
    if (!kind || !BODYWORK_SPECS[kind].glassBreakImpulse) return undefined;
    return glass.get(id) ?? 'intact';
  },
  /** Golpe sobre una ventana: raja o estalla el vidrio. Devuelve el resultado para sonido/partículas. */
  impact(id: string, impulse: number): GlassImpactOutcome | null {
    const kind = bodyworkKindFromId(id);
    if (!kind) return null;
    const outcome = evaluateGlassImpact(kind, this.glassOf(id), impulse);
    if (outcome.changed) {
      glass.set(id, outcome.nextState);
      for (const l of glassListeners) l();
    }
    return outcome;
  },
  /** Reparar (H): vidrio nuevo. */
  repairGlass(id?: string) {
    if (id) glass.delete(id); else glass.clear();
    for (const l of glassListeners) l();
  },
  subscribe(l: () => void) { glassListeners.add(l); return () => { glassListeners.delete(l); }; },
  snapAngleIndex: () => snapAngleIndex,
  cycleSnapAngle(step = 1) {
    const n = BODYWORK_SNAP_ANGLES.length;
    snapAngleIndex = (((snapAngleIndex + step) % n) + n) % n;
    return BODYWORK_SNAP_ANGLES[snapAngleIndex];
  },
};
