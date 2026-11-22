import {
  hasMaterialNear,
  nearestMaterial,
  steerPivotLocal,
  forkGap,
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

/**
 * Rueda montada en horquilla: eje lateral y un brazo de la pieza madre a cada lado. Si es así, la mangueta
 * gira sobre el centro exacto de la rueda (sin desplazamiento lateral) y no golpea los brazos al doblar.
 */
export function isForkMount(grid: PlatformGrid, pose: LocalPoseLike): boolean {
  const axis = pose.axis ?? { x: 1, y: 0, z: 0 };
  if (Math.abs(axis.x) < 0.9) return false;
  return forkGap(grid, pose.position.x, pose.position.z) !== null;
}

/** Pivote de la mangueta de una rueda en horquilla (su centro), o `null` si no está en una horquilla. */
export function forkPivotFor(grid: PlatformGrid, pose: LocalPoseLike) {
  return isForkMount(grid, pose) ? { x: pose.position.x, y: pose.position.y, z: pose.position.z } : null;
}

/** Huella en planta de una rueda soldada a la plataforma (en coordenadas de la plataforma). */
export function wheelFootprintFromPose(pose: LocalPoseLike, grid?: PlatformGrid): WheelFootprint {
  const axis = pose.axis ?? { x: 1, y: 0, z: 0 };
  const pivot = (grid ? forkPivotFor(grid, pose) : null) ?? steerPivotLocal(pose.position, axis);
  return {
    x: pose.position.x, z: pose.position.z, y: pose.position.y, px: pivot.x, pz: pivot.z,
    axleYaw: Math.atan2(-axis.z, axis.x),
  };
}

export function steerLimitsOnPlatform(grid: PlatformGrid, pose: LocalPoseLike) {
  return steerClearance(grid, wheelFootprintFromPose(pose, grid));
}

export function steerSweepHits(grid: PlatformGrid, pose: LocalPoseLike) {
  return sweepHits(grid, wheelFootprintFromPose(pose, grid));
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
