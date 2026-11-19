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

describe('Manejo del vuelo libre (barril volador)', () => {
  it('sube, avanza, gira a ambos lados y baja sin volcarse', async () => {
    await rapier.init();
    resetContraptionGraph();
    const preset = PRESET_BLUEPRINTS.find((p) => p.id === 'preset-flying-barrel')!;
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
          id: part.partId, kind: part.kind, initialPos: [i * 2, 1, 0],
          getBody: () => body, getCollider: () => collider, getVisualGroup: () => null,
          getWorldPos: (out) => Boolean(out.copy(body.translation() as never)),
        });
      }
      const err = restoreCartBlueprint(preset, cart, assembly, physics, contraptionGraph, { world, rapier }, new Set());
      expect(err).toBeNull();

      const station = `custom:${preset.rootPartId}` as const;
      const rootBody = grabbableRegistry.getById(preset.rootPartId!)!.getBody()!;
      physics.toggleAssembly(station, rootBody, assembly);
      const run = (frames: number, input: { throttle: number; steer: number; ascend: boolean; descend: boolean }) => {
        let minUp = 1;
        for (let f = 0; f < frames; f++) {
          physics.driveAssembly(station, rootBody, input.throttle, 1 / 60, assembly);
          physics.steerAssembly(station, rootBody, input.steer, 1 / 60, undefined, assembly);
          physics.stabilizeAndFlyAssembly(station, rootBody, input, 1 / 60, assembly);
          world.step();
          const q = rootBody.rotation();
          minUp = Math.min(minUp, 1 - 2 * (q.x * q.x + q.z * q.z));
        }
        return minUp;
      };
      const yawOf = () => {
        const q = rootBody.rotation();
        return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      };
      const idle = { throttle: 0, steer: 0, ascend: false, descend: false };

      const y0 = rootBody.translation().y;
      const upTilt = run(90, { ...idle, ascend: true });
      const yUp = rootBody.translation().y;
      expect(yUp, 'Espacio debe subir').toBeGreaterThan(y0 + 2);
      expect(upTilt, 'no debe volcarse al subir').toBeGreaterThan(0.9);

      const yawBefore = yawOf();
      const turnTilt = run(60, { ...idle, steer: 1, ascend: true });
      const yawRight = yawOf();
      const dRight = Math.atan2(Math.sin(yawRight - yawBefore), Math.cos(yawRight - yawBefore));
      expect(dRight, 'steer + debe girar hacia un lado').toBeLessThan(-0.4);
      run(60, { ...idle, steer: -1, ascend: true });
      const yawLeft = yawOf();
      const dLeft = Math.atan2(Math.sin(yawLeft - yawRight), Math.cos(yawLeft - yawRight));
      expect(dLeft, 'steer - debe girar al lado contrario').toBeGreaterThan(0.4);
      expect(turnTilt, 'no debe volcarse al girar').toBeGreaterThan(0.8);

      const before = { ...rootBody.translation() };
      run(60, { ...idle, throttle: 1, ascend: true });
      const after = rootBody.translation();
      expect(Math.hypot(after.x - before.x, after.z - before.z), 'W debe avanzar').toBeGreaterThan(2);

      const yTop = rootBody.translation().y;
      run(120, { ...idle, descend: true });
      expect(rootBody.translation().y, 'Shift/Bajar debe descender').toBeLessThan(yTop - 1.5);

      // Recuperación tras impacto fuerte (como rozar el arco de salida):
      // un pico angular/lineal en la raíz NO debe amplificarse al resto de piezas ni volcar el barril.
      run(45, { ...idle, ascend: true });
      rootBody.setAngvel({ x: 18, y: -12, z: 24 }, true);
      rootBody.setLinvel({ x: 22, y: 6, z: 18 }, true);
      run(50, { ...idle, ascend: true });
      const recoveredQ = rootBody.rotation();
      const recoveredUp = 1 - 2 * (recoveredQ.x * recoveredQ.x + recoveredQ.z * recoveredQ.z);
      const recoveredV = rootBody.linvel();
      expect(recoveredUp, 'debe enderezarse tras un choque fuerte').toBeGreaterThan(0.92);
      expect(Math.hypot(recoveredV.x, recoveredV.z), 'velocidad horizontal debe quedar acotada').toBeLessThanOrEqual(16);
    } finally {
      for (const part of preset.parts) grabbableRegistry.unregister(part.partId);
      resetContraptionGraph();
      world.free();
    }
  });

  it('mantiene estables el Robot con Propulsores y la Silla Voladora con amortiguación real', async () => {
    await rapier.init();
    for (const presetId of ['preset-jetpack-robot', 'preset-balloon-chair'] as const) {
      resetContraptionGraph();
      const preset = PRESET_BLUEPRINTS.find((p) => p.id === presetId)!;
      const world = new rapier.World({ x: 0, y: -18, z: 0 });
      const assembly = new WorkshopAssembly();
      const physics = createWorkshopPhysics({ rapier, world }, getWiredEngineSignal, getMotorDirection);
      world.createCollider(rapier.ColliderDesc.cuboid(36, 0.5, 36).setTranslation(0, -0.5, 12));
      const cart = world.createRigidBody(
        rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN).setAdditionalSolverIterations(4),
      );
      world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0).setMass(14), cart);

      const colliders: Partial<Record<GrabbableKind, { desc: () => rapier.ColliderDesc; ld: number; ad: number }>> = {
        crate: { desc: () => rapier.ColliderDesc.cuboid(0.32, 0.3, 0.32).setMass(14), ld: 0.9, ad: 1.6 },
        spring: { desc: () => rapier.ColliderDesc.cylinder(0.22, 0.18).setMass(2.6), ld: 0.55, ad: 0.9 },
        seat: { desc: () => rapier.ColliderDesc.cuboid(0.25, 0.31, 0.26).setMass(3.6), ld: 0.7, ad: 1.1 },
        gyro: { desc: () => rapier.ColliderDesc.cuboid(0.2, 0.2, 0.2).setMass(2.6), ld: 0.35, ad: 1.6 },
        headlight: { desc: () => rapier.ColliderDesc.cuboid(0.15, 0.17, 0.16).setMass(2.0), ld: 0.65, ad: 1.0 },
        thruster: { desc: () => rapier.ColliderDesc.cylinder(0.34, 0.16).setMass(3.8), ld: 0.18, ad: 0.45 },
        battery: { desc: () => rapier.ColliderDesc.cuboid(0.27, 0.23, 0.23).setMass(4.2), ld: 0.75, ad: 1.1 },
        magnet: { desc: () => rapier.ColliderDesc.cuboid(0.22, 0.16, 0.22).setMass(3.6), ld: 0.65, ad: 1.0 },
        horn: { desc: () => rapier.ColliderDesc.cuboid(0.18, 0.16, 0.24).setMass(2.2), ld: 0.65, ad: 0.95 },
        balloon: { desc: () => rapier.ColliderDesc.cylinder(0.34, 0.28).setMass(0.7), ld: 0.85, ad: 1.4 },
        fan: { desc: () => rapier.ColliderDesc.cylinder(0.16, 0.26).setMass(3.0), ld: 0.35, ad: 0.7 },
      };

      try {
        for (const [i, part] of preset.parts.entries()) {
          const spec = colliders[part.kind]!;
          const body = world.createRigidBody(
            rapier.RigidBodyDesc.dynamic()
              .setTranslation(i * 2, 1, 0)
              .setLinearDamping(spec.ld)
              .setAngularDamping(spec.ad),
          );
          const collider = world.createCollider(spec.desc(), body);
          grabbableRegistry.register({
            id: part.partId, kind: part.kind, initialPos: [i * 2, 1, 0],
            getBody: () => body, getCollider: () => collider, getVisualGroup: () => null,
            getWorldPos: (out) => Boolean(out.copy(body.translation() as never)),
          });
        }
        const err = restoreCartBlueprint(preset, cart, assembly, physics, contraptionGraph, { world, rapier }, new Set());
        expect(err, presetId).toBeNull();
        const station = `custom:${preset.rootPartId}` as const;
        const rootBody = grabbableRegistry.getById(preset.rootPartId!)!.getBody()!;
        physics.toggleAssembly(station, rootBody, assembly);

        let minUp = 1;
        for (let f = 0; f < 120; f++) {
          const ascend = f < 70;
          const throttle = f >= 30 && f < 90 ? 1 : 0;
          const steer = f >= 40 && f < 80 ? 1 : 0;
          stepContraptionLogic(
            1 / 60,
            { KeyW: throttle > 0, KeyS: false, Space: ascend },
            physics.isDrivenWheel,
            ascend ? assembly.idsOnStation(station) : undefined,
            (id) => assembly.isMounted(id),
            (id) => assembly.stationOf(id) === station,
          );
          physics.stabilizeAndFlyAssembly(station, rootBody, { throttle, steer, ascend, descend: f >= 90 }, 1 / 60, assembly);
          world.step();
          const q = rootBody.rotation();
          minUp = Math.min(minUp, 1 - 2 * (q.x * q.x + q.z * q.z));
        }
        expect(minUp, `${presetId} no debe volcarse en vuelo`).toBeGreaterThan(0.82);
        expect(rootBody.translation().y, `${presetId} debe despegar del suelo`).toBeGreaterThan(1.5);
      } finally {
        for (const part of preset.parts) grabbableRegistry.unregister(part.partId);
        resetContraptionGraph();
        world.free();
      }
    }
  });
});
