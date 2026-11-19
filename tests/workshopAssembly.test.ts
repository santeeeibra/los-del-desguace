import rapier from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { WorkshopAssembly, WORKSHOP_ORIGIN, WORKSHOP_SLOTS } from '../src/invention/workshopAssembly';
import { createWorkshopPhysics, getWorkshopSlotPose } from '../src/invention/workshopPhysics';

function slot(id: string) {
  const result = WORKSHOP_SLOTS.find((entry) => entry.id === id);
  if (!result) throw new Error(`Punto de montaje desconocido: ${id}`);
  return result;
}

describe('armado en el taller', () => {
  it('rechaza tipos incompatibles, posiciones ocupadas y la misma pieza dos veces', () => {
    const workshop = new WorkshopAssembly();
    const left = slot('wheel_fl');
    const right = slot('wheel_fr');

    expect(workshop.mount('engine-1', left, 'engine')).toBe(false);
    expect(workshop.mount('wheel-1', left, 'wheel')).toBe(true);
    expect(workshop.mount('wheel-2', left, 'wheel')).toBe(false);
    expect(workshop.mount('wheel-1', right, 'wheel')).toBe(false);
    expect(workshop.mount('wheel-2', right, 'wheel')).toBe(true);
  });

  it('permite reubicar el motor después de retirar el que está montado', () => {
    const workshop = new WorkshopAssembly();
    const front = slot('engine_front');
    const rear = slot('engine_rear');

    expect(workshop.mount('engine-1', front, 'engine')).toBe(true);
    expect(workshop.canMount(rear, 'engine')).toBe(false);
    expect(workshop.describeSlot(rear, false)).toBe('El carrito ya tiene un motor en el otro alojamiento');
    workshop.remove('engine-1');
    expect(workshop.isMounted('engine-1')).toBe(false);
    expect(workshop.describeSlot(rear, false)).toBe('Acepta: Motor');
    expect(workshop.mount('engine-1', rear, 'engine')).toBe(true);
  });

  it('al reiniciar permite montar de nuevo la misma pieza en el mismo punto', () => {
    const workshop = new WorkshopAssembly();
    const wheel = slot('wheel_fl');

    expect(workshop.mount('wheel-1', wheel, 'wheel')).toBe(true);
    workshop.reset();
    expect(workshop.isMounted('wheel-1')).toBe(false);
    expect(workshop.mount('wheel-1', wheel, 'wheel')).toBe(true);
  });

  it('transmite solo al eje conectado y permite usar el mismo tipo de motor en el tambor', () => {
    const workshop = new WorkshopAssembly();
    const front = slot('wheel_fl');
    const rear = slot('wheel_rl');
    const drum = slot('drum_axle');
    workshop.mount('wheel-front', front, 'wheel');
    workshop.mount('wheel-rear', rear, 'wheel');
    workshop.mount('cart-engine', slot('engine_rear'), 'engine');
    workshop.mount('canister', drum, 'drum');
    expect(workshop.isPowered(front)).toBe(false);
    expect(workshop.isPowered(rear)).toBe(true);
    expect(workshop.status('cart')).toBe('Carrito · 2/4 ruedas · Tracción trasera');
    expect(workshop.isPowered(drum)).toBe(false);
    expect(workshop.status('drum')).toBe('Falta el motor del tambor');

    expect(workshop.mount('drum-engine', slot('drum_engine'), 'engine')).toBe(true);
    expect(workshop.isPowered(drum)).toBe(true);
    workshop.remove('drum-engine');
    expect(workshop.isPowered(drum)).toBe(false);
    expect(workshop.isPowered(rear)).toBe(true);
  });

  it('Rapier gira ruedas y tambor sobre sus propios ejes y libera las juntas al desmontar', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const workshop = new WorkshopAssembly();
    const wheelSlot = slot('wheel_fl');
    const drumSlot = slot('drum_axle');
    const wheel = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(
      wheelSlot.worldPosition.x, wheelSlot.worldPosition.y, wheelSlot.worldPosition.z,
    ));
    const drum = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(
      drumSlot.worldPosition.x, drumSlot.worldPosition.y, drumSlot.worldPosition.z,
    ));
    world.createCollider(rapier.ColliderDesc.cylinder(0.14, 0.38).setRotation({
      x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2,
    }), wheel);
    world.createCollider(rapier.ColliderDesc.cylinder(0.38, 0.22), drum);

    try {
      workshop.mount('wheel', wheelSlot, 'wheel');
      workshop.mount('drum', drumSlot, 'drum');
      workshop.mount('cart-engine', slot('engine_front'), 'engine');
      workshop.mount('drum-engine', slot('drum_engine'), 'engine');
      physics.attach('wheel', wheelSlot, wheel);
      physics.attach('drum', drumSlot, drum);
      physics.updateMotors(workshop);
      for (let frame = 0; frame < 60; frame++) world.step();

      expect(Math.abs(wheel.angvel().x)).toBeGreaterThan(2);
      expect(Math.abs(drum.angvel().y)).toBeGreaterThan(2);
      expect(drum.translation().y).toBeCloseTo(drumSlot.worldPosition.y, 2);

      workshop.remove('drum-engine');
      physics.updateMotors(workshop);
      drum.setAngvel({ x: 0, y: 0, z: 0 }, true);
      drum.applyTorqueImpulse({ x: 0, y: 0.04, z: 0 }, true);
      for (let frame = 0; frame < 10; frame++) world.step();
      expect(drum.angvel().y).toBeGreaterThan(0.3);

      physics.detach('drum');
      for (let frame = 0; frame < 10; frame++) world.step();
      expect(drum.translation().y).toBeLessThan(drumSlot.worldPosition.y - 0.1);
      physics.reset();
      expect(world.impulseJoints.len()).toBe(0);
    } finally {
      world.free();
    }
  });

  it('gira un carrito con sus piezas y rueda por un empujón sin motor', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const assembly = new WorkshopAssembly();
    const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN));
    cart.setAdditionalSolverIterations(4);
    cart.enableCcd(true);
    world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0).setMass(14), cart);
    world.createCollider(rapier.ColliderDesc.cuboid(20, 0.1, 20).setTranslation(0, -0.1, 0));
    const wheelMounts = WORKSHOP_SLOTS.filter((entry) => entry.type === 'wheel').map((entry) => {
      const { position } = getWorkshopSlotPose(entry, cart);
      const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z));
      world.createCollider(rapier.ColliderDesc.cylinder(0.14, 0.38).setMass(3.4).setRotation({
        x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2,
      }), body);
      assembly.mount(entry.id, entry, 'wheel');
      physics.attach(entry.id, entry, body, cart);
      return { entry, body };
    });

    try {
      world.step();
      expect(physics.rotateCart(cart)).toBe(true);
      world.step();
      for (const { entry, body } of wheelMounts) {
        const { position } = getWorkshopSlotPose(entry, cart);
        expect(body.translation().x).toBeCloseTo(position.x, 3);
        expect(body.translation().z).toBeCloseTo(position.z, 3);
      }

      const before = cart.translation();
      const obstacle = world.createCollider(rapier.ColliderDesc.ball(0.23)
        .setTranslation(before.x + 0.96, before.y + 0.36, before.z - 0.92));
      world.step();
      expect(physics.rotateCart(cart)).toBe(false);
      expect(cart.rotation().y).toBeCloseTo(Math.sin(Math.PI / 8), 3);
      world.removeCollider(obstacle, true);

      physics.toggleCart(cart, assembly);
      expect(cart.bodyType()).toBe(rapier.RigidBodyType.Dynamic);
      for (let frame = 0; frame < 12; frame++) world.step();
      physics.pushCart(cart, { x: before.x - 1, z: before.z - 1 });
      for (let frame = 0; frame < 45; frame++) world.step();
      expect(Math.hypot(cart.translation().x - before.x, cart.translation().z - before.z)).toBeGreaterThan(0.15);
      expect(wheelMounts.some(({ body }) => Math.hypot(body.angvel().x, body.angvel().z) > 0.15)).toBe(true);
      physics.toggleCart(cart, assembly);
      expect(cart.bodyType()).toBe(rapier.RigidBodyType.Fixed);

      const engineSlot = slot('engine_front');
      const enginePose = getWorkshopSlotPose(engineSlot, cart);
      const engine = world.createRigidBody(rapier.RigidBodyDesc.dynamic()
        .setTranslation(enginePose.position.x, enginePose.position.y, enginePose.position.z)
        .setRotation(enginePose.rotation));
      world.createCollider(rapier.ColliderDesc.cuboid(0.27, 0.23, 0.23).setMass(4.2), engine);
      assembly.mount('driving-engine', engineSlot, 'engine');
      physics.attach('driving-engine', engineSlot, engine, cart);
      physics.updateMotors(assembly);
      const poweredStart = cart.translation();
      physics.toggleCart(cart, assembly);
      for (let frame = 0; frame < 60; frame++) {
        physics.stepRunning(cart, frame / 60);
        world.step();
      }
      expect(assembly.releasedCartStatus()).toBe('Carrito libre · Motor en marcha');
      const at = cart.translation();
      const dx = at.x - poweredStart.x;
      const dz = at.z - poweredStart.z;
      const distance = Math.hypot(dx, dz);
      expect(distance).toBeGreaterThan(0.2);

      const wallYaw = Math.atan2(dx, dz);
      const wall = world.createCollider(rapier.ColliderDesc.cuboid(3, 1, 0.12)
        .setTranslation(at.x + 2.1 * dx / distance, 0.95, at.z + 2.1 * dz / distance)
        .setRotation({ x: 0, y: Math.sin(wallYaw / 2), z: 0, w: Math.cos(wallYaw / 2) }));
      const attachments = [...wheelMounts, { entry: engineSlot, body: engine }];
      let hitWall = false;
      let maxJointGap = 0;
      for (let frame = 0; frame < 240; frame++) {
        physics.stepRunning(cart, 1 + frame / 60);
        world.step();
        for (const { entry, body } of attachments) {
          const { position } = getWorkshopSlotPose(entry, cart);
          const wheelAt = body.translation();
          maxJointGap = Math.max(maxJointGap, Math.hypot(wheelAt.x - position.x, wheelAt.y - position.y, wheelAt.z - position.z));
          world.contactPair(body.collider(0), wall, () => { hitWall = true; });
        }
      }
      expect(hitWall).toBe(true);
      expect(world.impulseJoints.len()).toBe(5);
      expect(maxJointGap).toBeLessThan(0.13);
    } finally {
      world.free();
    }
  });

  it('permite montar uniones fijas y ejes sobre piezas ya montadas heredando transmisión y desmontando en cascada', () => {
    const workshop = new WorkshopAssembly();
    const drumEngine = slot('drum_engine');
    expect(workshop.mount('engine-drum', drumEngine, 'engine')).toBe(true);

    const crateMount = workshop.mountOnPart('crate-1', 'engine-drum', 'fixture');
    expect(crateMount).not.toBeNull();
    expect(crateMount?.station).toBe('drum');
    expect(crateMount?.transmission).toBe('drum');
    expect(workshop.canMountOnPart('crate-1', 'engine')).toBe(false);
    expect(workshop.describePartMount('crate-1', 'engine', false)).toBe('Ese eje ya tiene un motor');

    const wheelMount = workshop.mountOnPart('wheel-extra', 'crate-1', 'wheel', { x: 1, y: 0, z: 0 });
    expect(wheelMount).not.toBeNull();
    expect(workshop.isPowered(wheelMount!)).toBe(true);
    expect(workshop.isMounted('wheel-extra')).toBe(true);

    const removed = workshop.remove('crate-1');
    expect(removed).toEqual(['crate-1', 'wheel-extra']);
    expect(workshop.isMounted('crate-1')).toBe(false);
    expect(workshop.isMounted('wheel-extra')).toBe(false);
  });

  it('Rapier transmite giro a un eje montado sobre otra pieza ya montada y libera sus juntas en cascada', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const workshop = new WorkshopAssembly();

    const engineSlot = slot('drum_engine');
    const engineBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(
      engineSlot.worldPosition.x, engineSlot.worldPosition.y, engineSlot.worldPosition.z,
    ));
    world.createCollider(rapier.ColliderDesc.cuboid(0.25, 0.22, 0.22).setMass(4), engineBody);

    const cratePos = { x: engineSlot.worldPosition.x, y: engineSlot.worldPosition.y + 0.55, z: engineSlot.worldPosition.z };
    const crateBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(cratePos.x, cratePos.y, cratePos.z));
    world.createCollider(rapier.ColliderDesc.cuboid(0.3, 0.3, 0.3).setMass(2), crateBody);

    const wheelPos = { x: cratePos.x + 0.46, y: cratePos.y, z: cratePos.z };
    const wheelBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(wheelPos.x, wheelPos.y, wheelPos.z));
    world.createCollider(rapier.ColliderDesc.cylinder(0.14, 0.38).setMass(2).setRotation({
      x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2,
    }), wheelBody);

    try {
      workshop.mount('engine-drum', engineSlot, 'engine');
      physics.attach('engine-drum', engineSlot, engineBody);

      const crateMount = workshop.mountOnPart('crate-1', 'engine-drum', 'fixture')!;
      physics.attachOnPart('crate-1', crateMount, crateBody, engineBody, cratePos, { x: 0, y: 0, z: 0, w: 1 });

      const wheelMount = workshop.mountOnPart('wheel-extra', 'crate-1', 'wheel', { x: 1, y: 0, z: 0 })!;
      physics.attachOnPart(
        'wheel-extra', wheelMount, wheelBody, crateBody, wheelPos, { x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 0, z: 0 },
      );

      physics.updateMotors(workshop);
      for (let frame = 0; frame < 45; frame++) world.step();

      expect(world.impulseJoints.len()).toBe(3);
      expect(Math.abs(wheelBody.angvel().x)).toBeGreaterThan(2);
      expect(Math.abs(crateBody.translation().y - cratePos.y)).toBeLessThan(0.05);

      for (const id of workshop.remove('crate-1')) {
        physics.detach(id);
      }
      expect(world.impulseJoints.len()).toBe(1);
    } finally {
      world.free();
    }
  });

  it('extiende fijar, girar, mover, empujar y deshacer a creaciones independientes', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: -18, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const workshop = new WorkshopAssembly();

    const rootPos = { x: 0, y: 0.4, z: 0 };
    const rootBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(rootPos.x, rootPos.y, rootPos.z));
    world.createCollider(rapier.ColliderDesc.cuboid(0.3, 0.3, 0.3).setMass(4), rootBody);

    const childPos = { x: 0, y: 0.95, z: 0 };
    const childBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(childPos.x, childPos.y, childPos.z));
    world.createCollider(rapier.ColliderDesc.cuboid(0.25, 0.25, 0.25).setMass(2), childBody);

    try {
      const mount = workshop.mountOnPart('child-1', 'root-crate', 'fixture')!;
      expect(mount.station).toBe('custom:root-crate');
      expect(workshop.canUndo()).toBe(true);

      physics.fixCustomRoot(rootBody);
      physics.attachOnPart('child-1', mount, childBody, rootBody, childPos, { x: 0, y: 0, z: 0, w: 1 });
      world.step();

      expect(physics.moveAssembly(mount.station, rootBody, { x: 0.5, y: 0, z: 0 })).toBe(true);
      expect(rootBody.translation().x).toBeCloseTo(0.5, 3);
      expect(childBody.translation().x).toBeCloseTo(0.5, 3);

      const blocker = world.createCollider(rapier.ColliderDesc.ball(0.25).setTranslation(1.2, 0.4, 0));
      world.step();
      expect(physics.moveAssembly(mount.station, rootBody, { x: 0.5, y: 0, z: 0 })).toBe(false);
      world.removeCollider(blocker, true);

      expect(physics.rotateAssembly(mount.station, rootBody, Math.PI / 4)).toBe(true);
      expect(rootBody.rotation().y).toBeCloseTo(Math.sin(Math.PI / 8), 3);

      physics.toggleAssembly(mount.station, rootBody, workshop);
      expect(physics.isReleased(mount.station)).toBe(true);
      expect(rootBody.bodyType()).toBe(rapier.RigidBodyType.Dynamic);
      world.step();
      physics.pushAssembly(mount.station, rootBody, { x: -1, z: 0 });
      for (let frame = 0; frame < 15; frame++) world.step();
      expect(rootBody.translation().x).toBeGreaterThan(0.6);

      const lastId = workshop.popLastMounted();
      expect(lastId).toBe('child-1');
      const removed = workshop.remove(lastId!);
      expect(removed).toEqual(['child-1', 'root-crate']);
      for (const id of removed) physics.detach(id);
      expect(world.impulseJoints.len()).toBe(0);
      expect(workshop.canUndo()).toBe(false);
    } finally {
      world.free();
    }
  });

  it('completa el carrito con asiento y soporte de carga opcional y permite armar sobre chasis manipulable', () => {
    const workshop = new WorkshopAssembly();
    const seatSlot = slot('seat_center');
    const rackSlot = slot('rack_rear');

    expect(workshop.mount('wheel-1', slot('wheel_fl'), 'wheel')).toBe(true);
    expect(workshop.mount('seat-1', seatSlot, 'seat')).toBe(true);
    expect(workshop.status('cart')).toBe('Carrito · 1/4 ruedas · Con asiento · Podés empujarlo sin motor');

    expect(workshop.mount('rack-1', rackSlot, 'cargo_rack')).toBe(true);
    expect(workshop.status('cart')).toBe('Carrito · 1/4 ruedas · Con asiento · Con soporte · Podés empujarlo sin motor');

    const chassisWheel = workshop.mountOnPart('wheel-custom', 'chassis-1', 'wheel', { x: 1, y: 0, z: 0 }, 'chassis');
    expect(chassisWheel?.station).toBe('custom:chassis-1');
    expect(workshop.isMounted('chassis-1')).toBe(true);
  });
});
