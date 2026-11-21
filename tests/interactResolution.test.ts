import { beforeEach, describe, expect, it } from 'vitest';
import { dispatchGameKeyDown, playerInput } from '../src/controls/playerInput';
import {
  resolvePrimaryInteract,
  snapshotPrimaryInteractRequest,
  type HudInteractSnapshot,
} from '../src/invention/interactResolution';
import { gameStore } from '../src/state/gameStore';

const BASE_HUD: HudInteractSnapshot = {
  seated: false,
  assemblyInteraction: null,
  workshopSlot: null,
  partMountReady: false,
  carriedKind: null,
  wiringActive: false,
  nearbyTargetId: null,
  nearbyTargetRideable: false,
  nearbyTargetMounted: false,
};

describe('Interacción Subir vs Retirar (mismo objetivo entre aviso y acción)', () => {
  beforeEach(() => {
    playerInput.resetAll();
    gameStore.setSeated(false);
    gameStore.setCarried(null, null);
    gameStore.setAssemblyInteraction(null);
    gameStore.setWorkshopSlot(null);
    gameStore.setLaserInteraction(null, null, false, false);
    gameStore.setNearbyTarget(null, null, false, false);
  });

  it('cuando el aviso es Subir, sube al asiento incluso si una rueda pasa a ser bestId ese frame', () => {
    const req = snapshotPrimaryInteractRequest({
      ...BASE_HUD,
      nearbyTargetId: 'seat-1',
      nearbyTargetRideable: true,
      nearbyTargetMounted: true,
    });
    expect(req).toEqual({ intent: 'ride', targetId: 'seat-1' });

    const resolved = resolvePrimaryInteract(req, {
      isCarrying: false,
      hasHandling: true,
      bestId: 'wheel-1',
      bestMounted: true,
      bestRideable: false,
      requestedRideTargetInReach: true,
    });
    expect(resolved).toEqual({ kind: 'ride', targetId: 'seat-1' });
  });

  it('si el asiento deja de estar al alcance justo al pulsar Subir, deja el vehículo intacto y no desmonta ruedas', () => {
    const req = snapshotPrimaryInteractRequest({
      ...BASE_HUD,
      nearbyTargetId: 'seat-1',
      nearbyTargetRideable: true,
      nearbyTargetMounted: true,
    });

    const resolved = resolvePrimaryInteract(req, {
      isCarrying: false,
      hasHandling: true,
      bestId: 'wheel-1',
      bestMounted: true,
      bestRideable: false,
      requestedRideTargetInReach: false,
    });
    expect(resolved).toEqual({ kind: 'none' });
  });

  it('cuando el jugador elige explícitamente Retirar, desmonta esa pieza montada', () => {
    const req = snapshotPrimaryInteractRequest({
      ...BASE_HUD,
      nearbyTargetId: 'wheel-1',
      nearbyTargetRideable: false,
      nearbyTargetMounted: true,
    });
    expect(req).toEqual({ intent: 'unmount', targetId: 'wheel-1' });

    const resolved = resolvePrimaryInteract(req, {
      isCarrying: false,
      hasHandling: false,
      bestId: 'wheel-1',
      bestMounted: true,
      bestRideable: false,
      requestedRideTargetInReach: false,
    });
    expect(resolved).toEqual({ kind: 'unmount', targetId: 'wheel-1' });

    // Si justo cambió a otra rueda, no desmonta por accidente
    const shifted = resolvePrimaryInteract(req, {
      isCarrying: false,
      hasHandling: false,
      bestId: 'wheel-2',
      bestMounted: true,
      bestRideable: false,
      requestedRideTargetInReach: false,
    });
    expect(shifted).toEqual({ kind: 'none' });
  });

  it('una interacción genérica nunca desmonta por accidente una pieza montada', () => {
    const req = snapshotPrimaryInteractRequest(BASE_HUD);
    expect(req).toEqual({ intent: 'default', targetId: null });

    const mountedWheel = resolvePrimaryInteract(req, {
      isCarrying: false,
      hasHandling: false,
      bestId: 'wheel-1',
      bestMounted: true,
      bestRideable: false,
      requestedRideTargetInReach: false,
    });
    expect(mountedWheel).toEqual({ kind: 'none' });

    const looseWheel = resolvePrimaryInteract(req, {
      isCarrying: false,
      hasHandling: false,
      bestId: 'wheel-1',
      bestMounted: false,
      bestRideable: false,
      requestedRideTargetInReach: false,
    });
    expect(looseWheel).toEqual({ kind: 'pickup', targetId: 'wheel-1' });
  });

  it('KeyE y triggerInteract capturan el objetivo Subir desde gameStore', () => {
    gameStore.setNearbyTarget('seat-1', 'seat', true, true);
    dispatchGameKeyDown({ code: 'KeyE', key: 'e' });
    expect(playerInput.consumeInteractRequest()).toEqual({ intent: 'ride', targetId: 'seat-1' });
  });
});
