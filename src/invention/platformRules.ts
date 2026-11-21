import {
  hasMaterialNear,
  nearestMaterial,
  steerPivotLocal,
  steerClearance,
  sweepHits,
  WELD_SUPPORT_RADIUS,
  type PlatformGrid,
  type Pt,
  type WheelFootprint,
} from './platformShape';

export interface LocalPoseLike {
  position: { x: number; y: number; z: number };
  axis?: { x: number; y: number; z: number };
}

/** Huella en planta de una rueda soldada a la plataforma (en coordenadas de la plataforma). */
export function wheelFootprintFromPose(pose: LocalPoseLike): WheelFootprint {
  const axis = pose.axis ?? { x: 1, y: 0, z: 0 };
  const pivot = steerPivotLocal(pose.position, axis);
  return {
    x: pose.position.x, z: pose.position.z, y: pose.position.y, px: pivot.x, pz: pivot.z,
    axleYaw: Math.atan2(-axis.z, axis.x),
  };
}

export function steerLimitsOnPlatform(grid: PlatformGrid, pose: LocalPoseLike) {
  return steerClearance(grid, wheelFootprintFromPose(pose));
}

export function steerSweepHits(grid: PlatformGrid, pose: LocalPoseLike) {
  return sweepHits(grid, wheelFootprintFromPose(pose));
}

/** Punto de soldadura: el material más cercano al centro de la pieza vecina. */
export function weldPoint(grid: PlatformGrid, pose: LocalPoseLike): Pt | null {
  return nearestMaterial(grid, { x: pose.position.x, z: pose.position.z });
}

/**
 * Piezas que quedan sin apoyo después de un corte: su punto de soldadura (medido sobre la forma
 * anterior) ya no tiene material cerca en la forma nueva.
 */
export function unsupportedAfterCut(
  before: PlatformGrid,
  after: PlatformGrid,
  children: readonly { id: string; pose: LocalPoseLike }[],
): string[] {
  const out: string[] = [];
  for (const child of children) {
    const weld = weldPoint(before, child.pose);
    if (!weld || !hasMaterialNear(after, weld, WELD_SUPPORT_RADIUS)) out.push(child.id);
  }
  return out;
}
