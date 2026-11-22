import { Quaternion, Vector3 } from 'three';
import {
  BODYWORK_SPECS,
  bodyworkKindFromId,
  bodyworkStore,
  computeBodyworkEdgeSnap,
  type EdgeSnapResult,
} from './bodywork';

export type InteractIntent = 'ride' | 'unmount' | 'default';

export interface InteractRequest {
  intent: InteractIntent;
  targetId: string | null;
}

export interface HudInteractSnapshot {
  seated: boolean;
  assemblyInteraction: string | null;
  workshopSlot: string | null;
  partMountReady: boolean;
  carriedKind: string | null;
  wiringActive: boolean;
  nearbyTargetId: string | null;
  nearbyTargetRideable: boolean;
  nearbyTargetMounted: boolean;
}

/**
 * Captures the exact primary-interact intent and target currently shown by the HUD
 * (Subir / Retirar / default) so E, left click, and the touch button all act on the
 * same target the player saw when pressing.
 */
export function snapshotPrimaryInteractRequest(hud: HudInteractSnapshot): InteractRequest {
  if (
    hud.seated ||
    hud.assemblyInteraction ||
    hud.workshopSlot ||
    hud.partMountReady ||
    hud.carriedKind ||
    hud.wiringActive
  ) {
    return { intent: 'default', targetId: null };
  }
  if (hud.nearbyTargetRideable && hud.nearbyTargetId) {
    return { intent: 'ride', targetId: hud.nearbyTargetId };
  }
  if (hud.nearbyTargetMounted && hud.nearbyTargetId) {
    return { intent: 'unmount', targetId: hud.nearbyTargetId };
  }
  return { intent: 'default', targetId: hud.nearbyTargetId };
}

export interface LiveInteractState {
  isCarrying: boolean;
  hasHandling: boolean;
  bestId: string | null;
  bestMounted: boolean;
  bestRideable: boolean;
  /** True when request.targetId is still a valid rideable seat in reach on this frame. */
  requestedRideTargetInReach: boolean;
}

export type ResolvedPrimaryInteract =
  | { kind: 'ride'; targetId: string }
  | { kind: 'unmount'; targetId: string }
  | { kind: 'pickup'; targetId: string }
  | { kind: 'assembly' }
  | { kind: 'carry' }
  | { kind: 'none' };

/**
 * Resolves a primary-interact request (E / left click / touch button) against the live frame.
 * Guarantees that:
 * - Pressing while HUD shows "Subir" ONLY boards that seat (if still in reach) and NEVER
 *   unmounts a wheel or alters the vehicle if the seat just left reach.
 * - Pressing while HUD shows "Retirar" ONLY unmounts that exact mounted piece if still targeted.
 * - A generic interact never accidentally unmounts a mounted non-rideable piece.
 */
export function resolvePrimaryInteract(
  request: InteractRequest,
  live: LiveInteractState,
): ResolvedPrimaryInteract {
  if (live.isCarrying) {
    return { kind: 'carry' };
  }

  if (request.intent === 'ride') {
    if (request.targetId && live.requestedRideTargetInReach) {
      return { kind: 'ride', targetId: request.targetId };
    }
    return { kind: 'none' };
  }

  if (request.intent === 'unmount') {
    if (
      request.targetId &&
      live.bestId === request.targetId &&
      live.bestMounted &&
      !live.bestRideable
    ) {
      return { kind: 'unmount', targetId: request.targetId };
    }
    return { kind: 'none' };
  }

  if (live.hasHandling) {
    return { kind: 'assembly' };
  }

  if (live.bestId && live.bestRideable) {
    return { kind: 'ride', targetId: live.bestId };
  }

  if (live.bestId && !live.bestMounted) {
    return { kind: 'pickup', targetId: live.bestId };
  }

  return { kind: 'none' };
}

// ---------- Encastre de carrocería por borde (edge-snap) ----------

/** Medidas aproximadas [X, Y, Z] de las piezas que aceptan carrocería encastrada por borde. */
const HOST_SIZES: Record<string, readonly [number, number, number]> = {
  chassis: [1.1, 0.16, 1.9],
  cart: [1.2, 0.2, 2.0],
};

export interface BodyworkHost {
  id: string;
  kind: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  /** Medidas de una plataforma recortada (si el anfitrión es una plataforma). */
  size?: readonly [number, number, number];
}

/**
 * Si se lleva una pieza de carrocería y se apunta cerca del borde de un chasis, una plataforma u otra
 * chapa, devuelve dónde y cómo encastrarla (ángulo elegido con R: 0°, ±45°, ±90°). Si no, null.
 */
export function resolveBodyworkSnap(carriedId: string, host: BodyworkHost, hitPoint: { x: number; y: number; z: number }): EdgeSnapResult | null {
  const kind = bodyworkKindFromId(carriedId);
  if (!kind) return null;
  const hostBodywork = bodyworkKindFromId(host.id);
  const hostSize = host.size ?? (hostBodywork ? BODYWORK_SPECS[hostBodywork].size : HOST_SIZES[host.kind]);
  if (!hostSize) return null;
  return computeBodyworkEdgeSnap(
    kind,
    {
      worldPosition: new Vector3(host.position.x, host.position.y, host.position.z),
      worldRotation: new Quaternion(host.rotation.x, host.rotation.y, host.rotation.z, host.rotation.w),
      hostSize,
    },
    new Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
    bodyworkStore.snapAngleIndex(),
  );
}
