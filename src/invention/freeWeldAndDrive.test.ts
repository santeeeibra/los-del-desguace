import rapier from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { captureCartBlueprint, restoreCartBlueprint } from './cartBlueprints';
import { WorkshopAssembly } from './workshopAssembly';
import { createWorkshopPhysics } from './workshopPhysics';
import { getPartLogicOutput, resetContraptionGraph, stepContraptionLogic } from '../logic/contraptionRegistry';
import { LogicGraph } from '../logic/logicGraph';
import { grabbableRegistry } from '../props/grabbableRegistry';

describe('soldadura libre y conducción', () => {
  it('mountFreeOnCart acopla piezas libres al carrito y detecta batería', () => {
    const workshop = new WorkshopAssembly();
    const wheel = workshop.mountFreeOnCart('w-free-1', 'wheel', { x: 1, y: 0, z: 0 });
    const engine = workshop.mountFreeOnCart('eng-free-1', 'engine');
    const bat = workshop.mountFreeOnCart('bat-free-1', 'battery');

    expect(wheel?.station).toBe('cart');
    expect(engine?.station).toBe('cart');
    expect(bat?.station).toBe('cart');
    expect(workshop.hasBattery('cart')).toBe(true);
    expect(workshop.engineIdFor(wheel!)).toBe('eng-free-1');
    expect(workshop.idsOnStation('cart')).toEqual(['w-free-1', 'eng-free-1', 'bat-free-1']);
  });

  it('driveAssembly y steerAssembly impulsan y giran una creación libre en Rapier', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: 0, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const workshop = new WorkshopAssembly();

    const chassis = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 1, 0));
    world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setMass(14), chassis);

    physics.toggleCart(chassis, workshop);
    expect(physics.isCartReleased()).toBe(true);
    world.step();

    physics.driveAssembly('cart', chassis, 1, 0.016);
    physics.steerAssembly('cart', chassis, 1, 0.016);
    world.step();

    expect(chassis.linvel().z).toBeGreaterThan(0.1);
    expect(Math.abs(chassis.angvel().y)).toBeGreaterThan(0.01);
    world.free();
  });

  it('sin motor soldado el carrito no avanza, y con motor sí', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: 0, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const workshop = new WorkshopAssembly();
    const chassis = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 1, 0));
    world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setMass(14), chassis);
    physics.toggleCart(chassis, workshop);
    world.step();

    workshop.mountFreeOnCart('w-1', 'wheel', { x: 1, y: 0, z: 0 });
    physics.driveAssembly('cart', chassis, 1, 0.016, workshop);
    world.step();
    expect(chassis.linvel().z).toBeCloseTo(0, 3);

    workshop.mountFreeOnCart('eng-1', 'engine');
    physics.driveAssembly('cart', chassis, 1, 0.016, workshop);
    world.step();
    expect(chassis.linvel().z).toBeGreaterThan(0.1);
    world.free();
  });

  it('guarda y restaura una rueda soldada perpendicular al frente del carrito', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: 0, z: 0 });
    const physics = createWorkshopPhysics({ world, rapier });
    const assembly = new WorkshopAssembly();
    const graph = new LogicGraph();
    const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, 1, 0));
    const wheel = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 1, 1.5));
    const collider = world.createCollider(rapier.ColliderDesc.cylinder(0.14, 0.38).setMass(3)
      .setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }), wheel);
    const id = 'w-roundtrip';
    grabbableRegistry.register({
      id, kind: 'wheel', initialPos: [0, 1, 1.5], getBody: () => wheel,
      getCollider: () => collider, getVisualGroup: () => null, getWorldPos: () => true,
    });
    try {
      const axis = new Vector3(0, 0, 1);
      const orientation = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), axis);
      wheel.setRotation(orientation, true);
      const mount = assembly.mountFreeOnCart(id, 'wheel', axis)!;
      physics.attachOnPart(id, mount, wheel, cart, wheel.translation(), orientation, axis);
      const saved = captureCartBlueprint('Rueda delantera libre', assembly, physics, graph);
      expect(saved?.parts[0].slotId).toBe(`free:cart:${id}`);
      assembly.remove(id);
      physics.detach(id);
      expect(world.impulseJoints.len()).toBe(0);
      expect(restoreCartBlueprint(saved!, cart, assembly, physics, graph, { world, rapier }, new Set())).toBeNull();
      for (let step = 0; step < 20; step++) world.step();
      const wheelAxis = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().copy(wheel.rotation()));
      expect(wheelAxis.dot(axis)).toBeGreaterThan(0.98);
      expect(wheel.translation().z).toBeCloseTo(1.5, 2);
    } finally {
      grabbableRegistry.unregister(id);
      world.free();
    }
  });

  it('activa y corta el turbo de un propulsor sin cable', async () => {
    await rapier.init();
    const world = new rapier.World({ x: 0, y: 0, z: 0 });
    const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
    const collider = world.createCollider(rapier.ColliderDesc.cylinder(0.34, 0.16).setMass(3), body);
    const id = 'thruster-turbo';
    grabbableRegistry.register({
      id, kind: 'thruster', initialPos: [0, 0, 0], getBody: () => body,
      getCollider: () => collider, getVisualGroup: () => null, getWorldPos: () => true,
    });
    try {
      world.step();
      stepContraptionLogic(1 / 60, {}, () => false, [id]);
      expect(body.linvel().y).toBeGreaterThan(1);
      expect(getPartLogicOutput(id)).toBe(1);
      stepContraptionLogic(1 / 60, {}, () => false);
      expect(getPartLogicOutput(id)).toBe(0);
    } finally {
      grabbableRegistry.unregister(id);
      resetContraptionGraph();
      world.free();
    }
  });
});
