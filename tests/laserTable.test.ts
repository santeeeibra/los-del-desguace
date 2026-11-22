import rapier from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  cutFromEdge,
  gridToRects,
  notchAt,
  PLATFORM_DENSITY,
  PLATFORM_TEMPLATES,
  PLATFORM_THICKNESS,
  rasterize,
  steerClearance,
  validateOutline,
  type PlatformGrid,
} from '../src/invention/platformShape';
import { steerLimitsOnPlatform, unsupportedAfterCut, wheelFootprintFromPose } from '../src/invention/platformRules';
import { WorkshopAssembly } from '../src/invention/workshopAssembly';
import { createWorkshopPhysics, qualifiesForSteering } from '../src/invention/workshopPhysics';
import { stepContraptionLogic } from '../src/logic/contraptionRegistry';
import { grabbableRegistry } from '../src/props/grabbableRegistry';

beforeAll(async () => {
  await rapier.init();
});

const WHEEL_ROT = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
const AXLE_X = { x: 1, y: 0, z: 0 };

describe('Mesa de Corte Láser — formas', () => {
  it('las cuatro bases se pueden fabricar y dan una sola pieza', () => {
    for (const template of Object.values(PLATFORM_TEMPLATES)) {
      expect(validateOutline(template.points)).toBeNull();
      expect(gridToRects(rasterize(template.points)).length).toBeGreaterThan(0);
    }
  });

  it('rechaza formas con bordes cruzados', () => {
    expect(validateOutline([{ x: -0.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: 0.5, z: -0.5 }, { x: -0.5, z: 0.5 }]))
      .toMatch(/cruzan/);
  });

  it('solo corta desde el borde y no deja la chapa partida', () => {
    const grid = rasterize(PLATFORM_TEMPLATES.rect.points);
    const inner = cutFromEdge(grid, [{ x: -0.1, z: -0.1 }, { x: 0.1, z: -0.1 }, { x: 0.1, z: 0.1 }, { x: -0.1, z: 0.1 }]);
    expect(inner.error).toMatch(/borde/);
    const split = cutFromEdge(grid, [{ x: -0.1, z: -0.9 }, { x: 0.1, z: -0.9 }, { x: 0.1, z: 0.9 }, { x: -0.1, z: 0.9 }]);
    expect(split.error).toMatch(/partiría/);
    const notch = cutFromEdge(grid, notchAt(grid, 'front', 0.4, 0.3));
    expect(notch.error).toBeNull();
    expect(notch.removed.length).toBeGreaterThan(0);
  });

  it('avisa qué pieza se suelta si el corte le saca el apoyo', () => {
    const grid = rasterize(PLATFORM_TEMPLATES.rect.points);
    const children = [
      { id: 'frente', pose: { position: { x: 0, y: 0, z: 0.75 } } },
      { id: 'atras', pose: { position: { x: 0, y: 0, z: -0.75 } } },
    ];
    const deep = cutFromEdge(grid, notchAt(grid, 'front', 0.5, 0.4));
    expect(unsupportedAfterCut(grid, deep.grid, children)).toEqual(['frente']);
    const shallow = cutFromEdge(grid, notchAt(grid, 'front', 0.5, 0.06));
    expect(unsupportedAfterCut(grid, shallow.grid, children)).toEqual([]);
  });
});

function buildPlatform(world: rapier.World, grid: PlatformGrid, body: rapier.RigidBody) {
  const colliders: rapier.Collider[] = [];
  for (const r of gridToRects(grid)) {
    colliders.push(world.createCollider(
      rapier.ColliderDesc.cuboid(r.hx, PLATFORM_THICKNESS / 2, r.hz)
        .setTranslation(r.x, 0, r.z)
        .setMass(r.hx * r.hz * 4 * PLATFORM_DENSITY),
      body,
    ));
  }
  return colliders;
}

describe('Mesa de Corte Láser — triciclo desde cero', () => {
  it('la rueda delantera trabada no dobla; después del recorte gira y el triciclo dobla', () => {
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    world.createCollider(rapier.ColliderDesc.cuboid(80, 0.5, 80).setTranslation(0, -0.5, 0).setFriction(1));
    let grid = rasterize(PLATFORM_TEMPLATES.triangle.points);
    const physics = createWorkshopPhysics({ world, rapier }, undefined, undefined,
      (_id, mount, pose) => (mount.parentId === 'plat' ? steerLimitsOnPlatform(grid, pose) : undefined));
    const workshop = new WorkshopAssembly();
    const platform = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 0.4, 0));
    let platformColliders = buildPlatform(world, grid, platform);

    const wheelAt = (id: string, x: number, z: number) => {
      const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(x, 0.4, z).setRotation(WHEEL_ROT));
      world.createCollider(rapier.ColliderDesc.cylinder(0.14, 0.38).setMass(3.4).setFriction(0.18), body);
      const mount = workshop.mountOnPart(id, 'plat', 'wheel', AXLE_X, 'fixture')!;
      const local = { x, z: z - 0 };
      physics.attachOnPart(id, mount, body, platform, body.translation(), WHEEL_ROT, AXLE_X,
        { steer: qualifiesForSteering(local, AXLE_X) });
      return body;
    };
    wheelAt('rueda-izq', -0.75, -0.5);
    wheelAt('rueda-der', 0.75, -0.5);
    wheelAt('rueda-frente', 0, 0.8 + 0.385);
    // Sin motor soldado el vehículo no avanza: se monta uno sobre la plataforma.
    expect(workshop.mountOnPart('motor', 'plat', 'engine', undefined, 'fixture')).not.toBeNull();

    expect(physics.isSteerable('rueda-frente')).toBe(true);
    expect(physics.isSteerable('rueda-izq')).toBe(false);

    const blocked = physics.steerInfo('rueda-frente')!;
    expect(blocked.max - blocked.min).toBeLessThan(0.2);

    const station = workshop.stationOf('rueda-frente')!;
    physics.toggleAssembly(station, platform, workshop);
    for (let i = 0; i < 30; i++) world.step();

    const yaw = () => {
      const fwd = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().copy(platform.rotation()));
      return Math.atan2(fwd.x, fwd.z);
    };
    let heading = 0;
    let last = 0;
    const drive = (steps: number, steer: number, throttle = 1) => {
      const dt = 1 / 60;
      for (let i = 0; i < steps; i++) {
        const now = yaw();
        let d = now - last;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        heading += d;
        last = now;
        physics.driveAssembly(station, platform, throttle, dt, workshop);
        physics.steerAssembly(station, platform, steer, dt, null, workshop);
        world.timestep = dt;
        world.step();
      }
      const now = yaw();
      let d = now - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      heading += d;
      last = now;
    };
    drive(30, 0);
    last = yaw();
    const startBlocked = heading;
    drive(120, 1, 0.3);
    const turnBlocked = Math.abs(heading - startBlocked);
    expect(turnBlocked).toBeLessThan(0.6);

    // Volver al taller, recortar la nariz desde la mesa y probar de nuevo.
    physics.toggleAssembly(station, platform, workshop);
    const pose = physics.getLocalAttachment('rueda-frente')!;
    const cut = cutFromEdge(grid, notchAt(grid, 'front', 0.6, 0.08));
    expect(cut.error).toBeNull();
    const children = ['rueda-izq', 'rueda-der', 'rueda-frente']
      .map((id) => ({ id, pose: physics.getLocalAttachment(id)! }));
    expect(unsupportedAfterCut(grid, cut.grid, children)).toEqual([]);
    expect(steerClearance(cut.grid, wheelFootprintFromPose(pose)).max).toBeGreaterThan(0.5);
    for (const c of platformColliders) world.removeCollider(c, true);
    grid = cut.grid;
    platformColliders = buildPlatform(world, grid, platform);
    physics.refreshBodyContacts(platform);
    physics.refreshSteerLimits('plat');
    const free = physics.steerInfo('rueda-frente')!;
    expect(free.max).toBeGreaterThan(0.5);
    expect(free.min).toBeLessThan(-0.5);

    physics.toggleAssembly(station, platform, workshop);
    for (let i = 0; i < 30; i++) world.step();
    last = yaw();
    drive(30, 0);
    const start = heading;
    drive(120, 1, 0.3);
    const angle = physics.steerInfo('rueda-frente')!.angle;
    expect(angle).toBeLessThan(-0.3); // derecha = giro horario visto desde arriba
    const turned = heading - start;
    expect(Math.abs(turned)).toBeGreaterThan(1);
    expect(Math.abs(turned)).toBeGreaterThan(turnBlocked * 4);
    // Doblar a la derecha (D) hace girar el rumbo en sentido horario visto desde arriba.
    expect(turned).toBeLessThan(0);
    const up = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().copy(platform.rotation()));
    expect(up.y).toBeGreaterThan(0.8);
    // Y también dobla a la izquierda (A), sin volcar.
    drive(60, 0, 0);
    const beforeLeft = heading;
    drive(120, -1, 0.3);
    const leftTurn = heading - beforeLeft;
    expect(leftTurn).toBeGreaterThan(1);
    const upLeft = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().copy(platform.rotation()));
    expect(upLeft.y).toBeGreaterThan(0.8);
    world.free();
  });

  it('una hélice soldada se puede girar en el lugar y cambia la dirección del empuje', () => {
    const world = new rapier.World({ x: 0, y: 0, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const workshop = new WorkshopAssembly();
    const platform = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 1, 0));
    world.createCollider(rapier.ColliderDesc.cuboid(0.5, 0.04, 0.7), platform);
    const fan = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 1.2, -0.4));
    const collider = world.createCollider(rapier.ColliderDesc.cylinder(0.16, 0.26).setMass(3), fan);
    grabbableRegistry.register({
      id: 'helice', kind: 'fan', initialPos: [0, 1.2, -0.4], getBody: () => fan,
      getCollider: () => collider, getVisualGroup: () => null, getWorldPos: () => true,
    });
    try {
      const mount = workshop.mountOnPart('helice', 'plat', 'fan', undefined, 'fixture')!;
      physics.attachOnPart('helice', mount, fan, platform, fan.translation(), fan.rotation());
      const thrustDir = () => {
        fan.setLinvel({ x: 0, y: 0, z: 0 }, true);
        stepContraptionLogic(1 / 60, {}, () => false, ['helice'], () => true);
        return new Vector3().copy(fan.linvel()).normalize();
      };
      expect(thrustDir().y).toBeGreaterThan(0.95);
      // Girarla 90° sobre el eje lateral: ahora empuja hacia adelante.
      expect(physics.rotateMountedPart('helice', { x: 1, y: 0, z: 0 }, Math.PI / 2)).toBe(true);
      for (let i = 0; i < 5; i++) world.step();
      const forward = thrustDir();
      expect(forward.z).toBeGreaterThan(0.95);
      // Y se mantiene soldada en el mismo lugar.
      expect(fan.translation().z).toBeCloseTo(-0.4, 1);
      expect(physics.getLocalAttachment('helice')).toBeDefined();
    } finally {
      grabbableRegistry.unregister('helice');
      world.free();
    }
  });
});
