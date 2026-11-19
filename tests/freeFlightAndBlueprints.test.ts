import rapier from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { dispatchGameKeyDown, playerInput } from '../src/controls/playerInput';
import { captureCartBlueprint, restoreCartBlueprint } from '../src/invention/cartBlueprints';
import { WORKSHOP_ORIGIN, WorkshopAssembly, isRideableMount } from '../src/invention/workshopAssembly';
import { createWorkshopPhysics } from '../src/invention/workshopPhysics';
import { decodeBlueprintCode, encodeBlueprintCode } from '../src/logic/blueprintManager';
import { cycleTimerPeriod, resetContraptionGraph } from '../src/logic/contraptionRegistry';
import { LogicGraph } from '../src/logic/logicGraph';
import { grabbableRegistry, type GrabbableKind } from '../src/props/grabbableRegistry';
import { gameStore } from '../src/state/gameStore';

describe('Vuelo libre, giroscopio, planos sin ruedas y atajos', () => {
  it('conserva las teclas apretadas al pasar de caminar a pilotear', () => {
    playerInput.resetAll();
    try {
      dispatchGameKeyDown({ code: 'KeyW', key: 'w' });
      dispatchGameKeyDown({ code: 'KeyD', key: 'd' });
      playerInput.setTouchJoystick(-1, -1);
      playerInput.triggerInteract();
      playerInput.resetTouchAndActions();
      expect(playerInput.keys.forward).toBe(true);
      expect(playerInput.keys.rightward).toBe(true);
      expect(playerInput.touch.joystickX).toBe(0);
      expect(playerInput.touch.joystickY).toBe(0);
      expect(playerInput.consumeInteract()).toBe(false);
    } finally {
      playerInput.resetAll();
    }
  });

  afterEach(() => {
    playerInput.resetAll();
    resetContraptionGraph();
    if (gameStore.getState().wrenchEquipped) gameStore.toggleWrench();
  });

  it('isRideableMount permite montar un barril soldado a un propulsor y rechaza un barril suelto', () => {
    const assembly = new WorkshopAssembly();
    expect(isRideableMount('wood-barrel-loose', 'woodBarrel', assembly)).toBe(false);

    assembly.mountOnPart('thruster-a', 'wood-barrel-1', 'thruster', undefined, 'drum');
    expect(isRideableMount('wood-barrel-1', 'woodBarrel', assembly)).toBe(true);
    expect(isRideableMount('thruster-a', 'thruster', assembly)).toBe(false);
  });

  it('hace roundtrip de captura, código compartible y restauración para un Barril Volador', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    const assembly = new WorkshopAssembly();
    const physics = createWorkshopPhysics({ world, rapier });
    const graph = new LogicGraph();
    const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN));
    const registered: string[] = [];

    const register = (id: string, kind: GrabbableKind, pos: [number, number, number], colliderDesc: rapier.ColliderDesc) => {
      const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(...pos));
      const collider = world.createCollider(colliderDesc.setMass(3), body);
      registered.push(id);
      grabbableRegistry.register({
        id,
        kind,
        initialPos: pos,
        getBody: () => body,
        getCollider: () => collider,
        getVisualGroup: () => null,
        getWorldPos: (out) => Boolean(out.copy(body.translation() as never)),
      });
      return body;
    };

    try {
      const barrel = register('wood-barrel-1', 'woodBarrel', [3, 0.64, 8.6], rapier.ColliderDesc.cylinder(0.48, 0.36));
      const thruster = register('thruster-1', 'thruster', [2.42, 0.6, 8.6], rapier.ColliderDesc.cylinder(0.34, 0.16));
      const gyro = register('gyro-1', 'gyro', [3, 0.58, 7.98], rapier.ColliderDesc.cuboid(0.2, 0.2, 0.2));

      physics.fixCustomRoot(barrel);
      const mThruster = assembly.mountOnPart('thruster-1', 'wood-barrel-1', 'thruster', undefined, 'fixture')!;
      const mGyro = assembly.mountOnPart('gyro-1', 'wood-barrel-1', 'gyro', undefined, 'fixture')!;
      physics.attachOnPart('thruster-1', mThruster, thruster, barrel, thruster.translation(), thruster.rotation());
      physics.attachOnPart('gyro-1', mGyro, gyro, barrel, gyro.translation(), gyro.rotation());
      graph.addNode('wood-barrel-1', 'key_input', { keyCode: 'Space' }, { bodyId: 'wood-barrel-1' });
      graph.addNode('thruster-1', 'thruster', { gain: 1 }, { bodyId: 'thruster-1' });
      graph.connect('wood-barrel-1', 'thruster-1', { toPort: 'signal' });

      const captured = captureCartBlueprint('Mi Barril Cohete', assembly, physics, graph, 'custom:wood-barrel-1');
      expect(captured).not.toBeNull();
      expect(captured?.rootPartId).toBe('wood-barrel-1');
      expect(captured?.category).toBe('free');

      const encoded = encodeBlueprintCode(captured!);
      const decoded = decodeBlueprintCode(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.rootPartId).toBe('wood-barrel-1');
      expect(decoded?.parts).toHaveLength(3);

      for (const id of assembly.remove('wood-barrel-1')) physics.detach(id);
      const err = restoreCartBlueprint(decoded!, cart, assembly, physics, graph, { world, rapier }, new Set());
      expect(err).toBeNull();
      expect(assembly.hasGyro('custom:wood-barrel-1')).toBe(true);
      expect(assembly.hasFlightPropulsion('custom:wood-barrel-1')).toBe(true);
      expect(world.impulseJoints.len()).toBe(2);
    } finally {
      for (const id of registered) grabbableRegistry.unregister(id);
      world.free();
    }
  });

  it('stabilizeAndFlyAssembly eleva, endereza con giroscopio (35°) y frena/desciende un Barril Volador', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    const assembly = new WorkshopAssembly();
    const physics = createWorkshopPhysics({ world, rapier });

    const barrel = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 1.5, 0));
    world.createCollider(rapier.ColliderDesc.cylinder(0.48, 0.36).setMass(6), barrel);
    const thruster = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(-0.6, 1.5, 0));
    world.createCollider(rapier.ColliderDesc.cylinder(0.34, 0.16).setMass(2.5), thruster);
    const gyro = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 1.5, -0.62));
    world.createCollider(rapier.ColliderDesc.cuboid(0.2, 0.2, 0.2).setMass(2), gyro);

    try {
      const mThruster = assembly.mountOnPart('thruster-fly', 'barrel-fly', 'thruster', undefined, 'fixture')!;
      const mGyro = assembly.mountOnPart('gyro-fly', 'barrel-fly', 'gyro', undefined, 'fixture')!;
      physics.attachOnPart('thruster-fly', mThruster, thruster, barrel, thruster.translation(), thruster.rotation());
      physics.attachOnPart('gyro-fly', mGyro, gyro, barrel, gyro.translation(), gyro.rotation());
      physics.toggleAssembly('custom:barrel-fly', barrel, assembly);

      // Inclinar 35 grados alrededor del eje X para comprobar auto-estabilización
      const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (35 * Math.PI) / 180);
      barrel.setRotation({ x: tilt.x, y: tilt.y, z: tilt.z, w: tilt.w }, true);

      const startY = barrel.translation().y;
      for (let i = 0; i < 90; i++) {
        physics.stabilizeAndFlyAssembly(
          'custom:barrel-fly',
          barrel,
          { throttle: 0, steer: 0, ascend: true, descend: false },
          1 / 60,
          assembly,
        );
        world.step();
      }
      expect(barrel.translation().y).toBeGreaterThan(startY + 2.0);
      const upAfterGyro = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().copy(barrel.rotation()));
      expect(upAfterGyro.y).toBeGreaterThan(0.95);

      // Descenso controlado
      barrel.setLinvel({ x: 0, y: 2.0, z: 0 }, true);
      for (let i = 0; i < 40; i++) {
        physics.stabilizeAndFlyAssembly(
          'custom:barrel-fly',
          barrel,
          { throttle: 0, steer: 0, ascend: false, descend: true },
          1 / 60,
          assembly,
        );
        world.step();
      }
      expect(barrel.linvel().y).toBeLessThan(0);

      // Responde al acelerador y giro en vuelo libre sin volcar
      for (let i = 0; i < 30; i++) {
        physics.stabilizeAndFlyAssembly(
          'custom:barrel-fly',
          barrel,
          { throttle: 1, steer: 0.6, ascend: true, descend: false },
          1 / 60,
          assembly,
        );
        world.step();
      }
      const horizSpeed = Math.hypot(barrel.linvel().x, barrel.linvel().z);
      const upAfterTurn = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().copy(barrel.rotation()));
      expect(horizSpeed).toBeGreaterThan(2.0);
      expect(upAfterTurn.y).toBeGreaterThan(0.9);
      expect(Math.abs(barrel.angvel().y)).toBeGreaterThan(0.3);
    } finally {
      world.free();
    }
  });

  it('cycleTimerPeriod cicla 0.6 -> 1.4 -> 3.0 -> 0.6', () => {
    const id = 'timer-cycle-test';
    grabbableRegistry.register({
      id,
      kind: 'timerBox',
      initialPos: [0, 0, 0],
      getBody: () => null,
      getCollider: () => null,
      getVisualGroup: () => null,
      getWorldPos: () => false,
    });
    try {
      expect(cycleTimerPeriod(id)).toBe('Pulso ajustado a 3.0s');
      expect(cycleTimerPeriod(id)).toBe('Pulso ajustado a 0.6s');
      expect(cycleTimerPeriod(id)).toBe('Pulso ajustado a 1.4s');
      expect(cycleTimerPeriod(id)).toBe('Pulso ajustado a 3.0s');
    } finally {
      grabbableRegistry.unregister(id);
    }
  });

  it('evita colisión entre Gestos (G) y Empujar (P) y activa los nuevos atajos sin conflictos', () => {
    dispatchGameKeyDown({ code: 'KeyG', key: 'g' });
    expect(playerInput.consumeCartAction()).toBeNull();

    dispatchGameKeyDown({ code: 'KeyP', key: 'p' });
    expect(playerInput.consumeCartAction()).toBe('push');

    dispatchGameKeyDown({ code: 'KeyF', key: 'f' });
    expect(playerInput.consumePartAction()).toBe('smart-use');

    dispatchGameKeyDown({ code: 'KeyK', key: 'k' });
    expect(playerInput.consumePartAction()).toBe('unwire');

    dispatchGameKeyDown({ code: 'KeyO', key: 'o' });
    expect(playerInput.consumePartAction()).toBe('cycle-timer');

    dispatchGameKeyDown({ code: 'KeyH', key: 'h' });
    expect(playerInput.consumeCartAction()).toBe('repair');

    dispatchGameKeyDown({ code: 'KeyJ', key: 'j' });
    expect(playerInput.consumePartAction()).toBe('ride');

    expect(gameStore.getState().wrenchAimLocked).toBe(false);
    dispatchGameKeyDown({ code: 'KeyM', key: 'm' });
    expect(gameStore.getState().wrenchEquipped).toBe(true);
    expect(gameStore.getState().wrenchAimLocked).toBe(true);
    expect(gameStore.getState().wrenchAiming).toBe(true);
  });
});
