import rapier from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { restoreCartBlueprint } from '../src/invention/cartBlueprints';
import { createWorkshopPhysics } from '../src/invention/workshopPhysics';
import { WORKSHOP_ORIGIN, WorkshopAssembly } from '../src/invention/workshopAssembly';
import {
  contraptionGraph,
  getMotorDirection,
  getWiredEngineSignal,
  resetContraptionGraph,
  stepContraptionLogic,
} from '../src/logic/contraptionRegistry';
import { PRESET_BLUEPRINTS } from '../src/logic/blueprintManager';
import { grabbableRegistry, type GrabbableKind } from '../src/props/grabbableRegistry';

describe('Estabilidad de los presets al subir al asiento', () => {
  it('conserva el agarre lateral al girar y restablece la fricción de las ruedas al reiniciar', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: 0, z: 0 });
    try {
      const assembly = new WorkshopAssembly();
      const physics = createWorkshopPhysics({ world, rapier });
      const root = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      world.createCollider(rapier.ColliderDesc.cuboid(0.4, 0.2, 0.8).setMass(14), root);
      const wheel = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0.8, 0, 0));
      const collider = world.createCollider(rapier.ColliderDesc.cylinder(0.12, 0.35).setFriction(0.95), wheel);
      const mount = assembly.mountOnPart('wheel', 'chassis', 'wheel', { x: 1, y: 0, z: 0 })!;
      physics.attachOnPart('wheel', mount, wheel, root, wheel.translation(), wheel.rotation());
      expect(collider.friction()).toBeCloseTo(0.18);

      physics.toggleAssembly(mount.station, root, assembly);
      world.step();
      root.setLinvel({ x: 3, y: 0, z: 4 }, true);
      physics.steerAssembly(mount.station, root, 1, 1 / 60);
      const velocity = root.linvel();
      expect(Math.hypot(velocity.x, velocity.z)).toBeLessThan(4.9);

      physics.reset();
      expect(collider.friction()).toBeCloseTo(0.95);
    } finally {
      world.free();
    }
  });

  it('evita choques internos y conserva el contacto entre creaciones distintas', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: 0, z: 0 });
    try {
      const assembly = new WorkshopAssembly();
      const physics = createWorkshopPhysics({ world, rapier });
      const makeBody = (x: number) => {
        const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(x, 1, 0));
        const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.2, 0.2, 0.2), body);
        return { body, collider };
      };
      const alpha = makeBody(0);
      const beta = makeBody(1.5);
      const firstPart = makeBody(0.4);
      const secondPart = makeBody(1.9);
      const original = alpha.collider.collisionGroups();
      for (const [id, rootId, root, part] of [
        ['a-part', 'a', alpha, firstPart],
        ['b-part', 'b', beta, secondPart],
      ] as const) {
        const mount = assembly.mountOnPart(id, rootId, 'fixture')!;
        physics.attachOnPart(id, mount, part.body, root.body, part.body.translation(), part.body.rotation());
      }
      const interacts = (a: number, b: number) => Boolean(((a >>> 16) & b & 0xffff) && ((b >>> 16) & a & 0xffff));
      expect(interacts(alpha.collider.collisionGroups(), firstPart.collider.collisionGroups())).toBe(false);
      expect(interacts(alpha.collider.collisionGroups(), beta.collider.collisionGroups())).toBe(true);
      physics.detach('a-part');
      expect(alpha.collider.collisionGroups()).toBe(original);
      expect(firstPart.collider.collisionGroups()).toBe(original);
    } finally {
      world.free();
    }
  });

  it.each(PRESET_BLUEPRINTS)('no sale volando ni se descontrola al subir a $name', async (preset) => {
    await rapier.init();
    resetContraptionGraph();
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    const assembly = new WorkshopAssembly();
    const physics = createWorkshopPhysics({ rapier, world }, getWiredEngineSignal, getMotorDirection);

    // Piso del taller en y = 0
    world.createCollider(rapier.ColliderDesc.cuboid(36, 0.5, 36).setTranslation(0, -0.5, 12));
    const cart = world.createRigidBody(
      rapier.RigidBodyDesc.fixed()
        .setTranslation(...WORKSHOP_ORIGIN)
        .setAdditionalSolverIterations(4)
        .setLinearDamping(0.65)
        .setAngularDamping(1.2),
    );
    world.createCollider(
      rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0).setMass(14).setFriction(0.65),
      cart,
    );

    const wheelRotation = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    const colliders: Partial<Record<GrabbableKind, () => rapier.ColliderDesc>> = {
      wheel: () => rapier.ColliderDesc.cylinder(0.14, 0.38).setRotation(wheelRotation).setMass(3.4).setFriction(0.95),
      part: () => rapier.ColliderDesc.cuboid(0.27, 0.23, 0.23).setMass(4.2),
      battery: () => rapier.ColliderDesc.cuboid(0.27, 0.23, 0.23).setMass(4.2),
      wing: () => rapier.ColliderDesc.cuboid(0.55, 0.07, 0.24).setMass(2.8),
      seat: () => rapier.ColliderDesc.cuboid(0.25, 0.31, 0.26).setMass(3.6),
      thruster: () => rapier.ColliderDesc.cylinder(0.34, 0.16).setMass(3.8),
      canister: () => rapier.ColliderDesc.cylinder(0.38, 0.22).setMass(4.5),
      woodBarrel: () => rapier.ColliderDesc.cylinder(0.48, 0.36).setMass(6),
      headlight: () => rapier.ColliderDesc.cuboid(0.15, 0.17, 0.16).setMass(2),
      switchBox: () => rapier.ColliderDesc.cuboid(0.18, 0.14, 0.18).setMass(2),
      timerBox: () => rapier.ColliderDesc.cuboid(0.18, 0.14, 0.18).setMass(2.2),
      logicAnd: () => rapier.ColliderDesc.cuboid(0.18, 0.14, 0.18).setMass(2.1),
      magnet: () => rapier.ColliderDesc.cuboid(0.22, 0.16, 0.22).setMass(3.6),
      cargoRack: () => rapier.ColliderDesc.cuboid(0.46, 0.12, 0.36).setMass(4.5),
      spring: () => rapier.ColliderDesc.cylinder(0.22, 0.18).setMass(2.6),
      balloon: () => rapier.ColliderDesc.cylinder(0.34, 0.28).setMass(0.7),
      fan: () => rapier.ColliderDesc.cylinder(0.16, 0.26).setMass(3.0),
      horn: () => rapier.ColliderDesc.cuboid(0.18, 0.16, 0.24).setMass(2.2),
      gyro: () => rapier.ColliderDesc.cuboid(0.2, 0.2, 0.2).setMass(2.6),
      crate: () => rapier.ColliderDesc.cuboid(0.32, 0.3, 0.32).setMass(14),
    };

    try {
      for (const [i, part] of preset.parts.entries()) {
        const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(i * 2, 1, 0));
        const collider = world.createCollider(colliders[part.kind]!(), body);
        grabbableRegistry.register({
          id: part.partId,
          kind: part.kind,
          initialPos: [i * 2, 1, 0],
          getBody: () => body,
          getCollider: () => collider,
          getVisualGroup: () => null,
          getWorldPos: (out) => Boolean(out.copy(body.translation() as never)),
        });
      }

      const err = restoreCartBlueprint(preset, cart, assembly, physics, contraptionGraph, { world, rapier }, new Set());
      expect(err).toBeNull();

      // Simular subir al asiento (soltar creación con throttle = 0) y luego acelerar (throttle = 1)
      const station = preset.rootPartId ? (`custom:${preset.rootPartId}` as const) : 'cart';
      const rootBody = preset.rootPartId ? grabbableRegistry.getById(preset.rootPartId)!.getBody()! : cart;
      const mountedParts = [...assembly.partsAt(station)].map(({ id }) => grabbableRegistry.getById(id)!.getBody()!);
      const positions = mountedParts.map((body) => body.translation());
      for (let f = 0; f < 90; f++) {
        physics.updateMotors(assembly);
        world.step();
      }
      mountedParts.forEach((body, index) => {
        const at = body.translation();
        expect(Math.hypot(at.x - positions[index].x, at.y - positions[index].y, at.z - positions[index].z)).toBeLessThan(0.005);
      });
      physics.toggleAssembly(station, rootBody, assembly, true);
      expect(mountedParts.every((body) => body.isDynamic() && body.mass() > 0)).toBe(true);
      const canTurn = assembly.hasWheels(station) || assembly.hasFlightPropulsion(station) || assembly.hasGyro(station);
      const heading = () => {
        const q = rootBody.rotation();
        return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
      };
      let firstTurnStart = 0;
      let maxY = 0;
      let maxVelY = 0;
      for (let f = 0; f < 180; f++) {
        const throttle = f < 60 ? 0 : 1;
        const steer = f >= 156 ? 1 : 0;
        if (f === 156) firstTurnStart = heading();
        stepContraptionLogic(1 / 60, { KeyW: throttle > 0, KeyS: false, Space: false }, physics.isDrivenWheel,
          undefined, (id) => assembly.isMounted(id));
        physics.updateMotors(assembly, { station, throttle });
        physics.stepRunning(cart, f / 60);
        if (assembly.hasWheels(station)) {
          physics.driveAssembly(station, rootBody, throttle, 1 / 60, assembly);
          physics.steerAssembly(station, rootBody, steer, 1 / 60, undefined, assembly);
        }
        physics.stabilizeAndFlyAssembly(
          station,
          rootBody,
          { throttle, steer, ascend: false, descend: false },
          1 / 60,
          assembly,
        );
        world.step();
        const t = rootBody.translation();
        const v = rootBody.linvel();
        maxY = Math.max(maxY, t.y);
        maxVelY = Math.max(maxVelY, Math.abs(v.y));
      }
      if (canTurn) {
        const delta = heading() - firstTurnStart;
        expect(Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))), `${preset.name} gira desde el primer montaje`)
          .toBeGreaterThan(0.02);
      }

      if (preset.id === 'preset-blimp' || preset.id === 'preset-balloon-chair') {
        expect(maxY, `${preset.name} se despega del piso`).toBeGreaterThan(1.5);
      } else if (preset.rootPartId) {
        // Las alas generan sustentación pasiva al avanzar (como el planeador), así que se exentan del techo.
        if (!preset.parts.some((p) => p.kind === 'wing')) {
          expect(maxY, `${preset.name} salió volando sin pulsar Espacio (maxY=${maxY.toFixed(2)})`).toBeLessThan(2.2);
        }
      } else if (preset.id !== 'preset-glider' && preset.id !== 'preset-pulse-jumper' && preset.id !== 'preset-cargo-plane') {
        expect(maxY, `${preset.name} salió volando (maxY=${maxY.toFixed(2)}, maxVelY=${maxVelY.toFixed(2)})`).toBeLessThan(1.5);
      }

      // La segunda vez que se sube, el invento sigue liberado y ya no cambia de tipo.
      if (canTurn) {
        for (const steer of [1, -1]) {
          const start = heading();
          for (let frame = 0; frame < 36; frame++) {
            const input = { throttle: 0.55, steer, ascend: false, descend: false };
            physics.updateMotors(assembly, { station, throttle: input.throttle });
            if (assembly.hasWheels(station)) {
              physics.driveAssembly(station, rootBody, input.throttle, 1 / 60, assembly);
              physics.steerAssembly(station, rootBody, steer, 1 / 60, undefined, assembly);
            }
            physics.stabilizeAndFlyAssembly(station, rootBody, input, 1 / 60, assembly);
            world.step();
          }
          const delta = heading() - start;
          expect(Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))), `${preset.name} responde a la dirección`)
            .toBeGreaterThan(0.02);
          physics.updateMotors(assembly);
          for (let frame = 0; frame < 6; frame++) world.step();
        }
      }
    } finally {
      for (const part of preset.parts) grabbableRegistry.unregister(part.partId);
      resetContraptionGraph();
      world.free();
    }
  });
});
