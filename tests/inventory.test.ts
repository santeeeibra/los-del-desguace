import { afterEach, describe, expect, it } from 'vitest';
import { playerInput, type PlayerInputSnapshot } from '../src/controls/playerInput';
import { emptyInventory, placeInInventory, type InventoryItem } from '../src/state/inventory';
import { gameStore } from '../src/state/gameStore';

function part(id: string): InventoryItem {
  return { id, kind: 'wheel', rotation: [0, 0, 0, 1] };
}

describe('inventario', () => {
  it('ofrece seis espacios, nunca duplica piezas y conserva la orientación', () => {
    const empty = emptyInventory();
    const wheel = { ...part('wheel'), rotation: [0, 1, 0, 0] as InventoryItem['rotation'] };
    const result = placeInInventory(empty, wheel, 3, true)!;
    expect(empty).toHaveLength(6);
    expect(empty[3]).toBeNull();
    expect(result.slots[3]).toEqual(wheel);
    expect(placeInInventory(result.slots, wheel, 4, true)).toBeNull();
    expect(placeInInventory(result.slots, part('new'), 3, true)).toBeNull();
    expect(placeInInventory(result.slots, part('new'), 3, false)?.index).toBe(0);
  });

  it('avisa que no queda espacio sin cambiar ningún slot', () => {
    const full = Array.from({ length: 6 }, (_, index) => part(String(index)));
    expect(placeInInventory(full, part('extra'), 0, false)).toBeNull();
    expect(full.map((item) => item.id)).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});

describe('teclado del juego', () => {
  afterEach(() => playerInput.resetAll());

  it('envía WASD al controlador mientras el inventario recibe sus propias teclas', () => {
    const snapshot: PlayerInputSnapshot = {
      forward: false, backward: false, leftward: false, rightward: false,
      jump: false, run: false, joystick: { x: 0, y: 0 },
    };
    playerInput.setMovementKey('KeyW', 'w', true);
    playerInput.setMovementKey('', 'A', true);
    playerInput.setMovementKey('KeyS', 's', true);
    playerInput.setMovementKey('KeyD', 'd', true);
    playerInput.triggerInventoryAction(5);
    playerInput.fillMovement(snapshot);
    expect(playerInput.consumeInventoryAction()).toBe(5);
    expect(snapshot).toMatchObject({ forward: true, backward: true, leftward: true, rightward: true });
    playerInput.setMovementKey('KeyW', 'w', false);
    playerInput.fillMovement(snapshot);
    expect(snapshot.forward).toBe(false);
  });

  it('vuelve a neutro aunque se pierda la liberación de D o del joystick', () => {
    const snapshot: PlayerInputSnapshot = {
      forward: false, backward: false, leftward: false, rightward: false,
      jump: false, run: false, joystick: { x: 0, y: 0 },
    };
    playerInput.setMovementKey('KeyD', 'd', true);
    playerInput.setTouchJoystick(1, 0);
    playerInput.fillMovement(snapshot);
    expect(snapshot).toMatchObject({ rightward: true, joystick: { x: 1, y: 0 } });

    playerInput.resetAll();
    playerInput.fillMovement(snapshot);
    expect(snapshot).toMatchObject({ rightward: false, joystick: { x: 0, y: 0 } });

    playerInput.setTouchJoystick(NaN, Infinity);
    playerInput.fillMovement(snapshot);
    expect(snapshot.joystick).toEqual({ x: 0, y: 0 });
  });
});

describe('mira de la llave', () => {
  it('solo se activa con la llave equipada y limpia el blanco al dejar de apuntar', () => {
    gameStore.setWrenchAiming(true);
    expect(gameStore.getState().wrenchAiming).toBe(false);
    gameStore.toggleWrench();
    try {
      gameStore.setWrenchAiming(true);
      expect(gameStore.getState().wrenchAiming).toBe(true);
      gameStore.setWrenchTarget('piece');
      gameStore.setWrenchAiming(false);
      expect(gameStore.getState()).toMatchObject({ wrenchAiming: false, wrenchTarget: null });
    } finally {
      gameStore.toggleWrench();
    }
  });
});
