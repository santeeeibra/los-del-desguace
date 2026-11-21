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
