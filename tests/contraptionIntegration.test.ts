import rapier from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { captureCartBlueprint, restoreCartBlueprint } from '../src/invention/cartBlueprints';
import { createWorkshopPhysics, getWorkshopSlotPose } from '../src/invention/workshopPhysics';
import { FREE_BUILD_ORIGIN, WORKSHOP_ORIGIN, WORKSHOP_SLOTS, WorkshopAssembly } from '../src/invention/workshopAssembly';
import { BOXING_REACH, contraptionGraph, describeWireDestination, disconnectAllWires, getMotorDirection, getPartLogicOutput, getWiredEngineSignal, invertMotorNode, isPartWired, pulseActuator, resetContraptionGraph, stepContraptionLogic, stepWireConnection, toggleSwitchNode } from '../src/logic/contraptionRegistry';
import { grabbableRegistry, type GrabbableKind } from '../src/props/grabbableRegistry';
import { PRESET_BLUEPRINTS } from '../src/logic/blueprintManager';
import { LogicGraph } from '../src/logic/logicGraph';
import { gameStore } from '../src/state/gameStore';

async function withActuatorWorld(
  test: (world: rapier.World, addProp: (kind: GrabbableKind, pos: [number, number, number]) => rapier.RigidBody) => void,
) {
  await rapier.init();
  const world = new rapier.World({ x: 0, y: 0, z: 0 });
  const ids: string[] = [];
  const addProp = (kind: GrabbableKind, initialPos: [number, number, number]) => {
    const id = `test-${kind}`;
    const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(...initialPos));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.15, 0.15, 0.15).setMass(2), body);
    ids.push(id);
    grabbableRegistry.register({
      id, kind, initialPos, getBody: () => body, getCollider: () => collider,
      getVisualGroup: () => null, getWorldPos: (out) => Boolean(out.copy(body.translation())),
    });
    return body;
  };
  resetContraptionGraph();
  try {
    test(world, addProp);
  } finally {
    ids.forEach((id) => grabbableRegistry.unregister(id));
    resetContraptionGraph();
    world.free();
  }
}

it('el puño empuja un objetivo adelante, retrocede y respeta una pared intermedia', () =>
  withActuatorWorld((world, addProp) => {
    const glove = addProp('boxingGlove', [0, 1, 0]);
    const target = addProp('crate', [0, 1, 1.15]);
    const wall = world.createCollider(rapier.ColliderDesc.cuboid(0.4, 0.4, 0.05).setTranslation(0, 1, 0.6));
    const step = () => stepContraptionLogic(1 / 60, {}, () => false, undefined, undefined, undefined,
      (_id, source, direction) => world.castRay(new rapier.Ray(source.translation(), direction),
        BOXING_REACH, true, undefined, undefined, undefined, source)?.collider.parent() ?? null);
    world.step();
    pulseActuator('test-boxingGlove');
    step();
    expect(target.linvel().z).toBe(0);
    world.removeCollider(wall, true);
    world.step();
    for (let i = 0; i < 52; i++) step();
    expect(target.linvel().z).toBe(0);
    pulseActuator('test-boxingGlove');
    step();
    expect(target.linvel().z).toBeGreaterThan(0);
    expect(glove.linvel().z).toBeLessThan(0);
  }));

it('la hélice de dron empuja en su eje local únicamente al recibir una señal', () =>
  withActuatorWorld((world, addProp) => {
    const rotor = addProp('droneRotor', [0, 1, 0]);
    addProp('switchBox', [1, 1, 0]);
    rotor.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2), true);
    world.step();
    const step = () => stepContraptionLogic(1 / 60, {}, () => false, undefined, () => true);
    step();
    expect(rotor.linvel().x).toBe(0);
    expect(stepWireConnection('test-switchBox').status).toBe('pending');
    expect(stepWireConnection('test-droneRotor').status).toBe('connected');
    step();
    expect(rotor.linvel().x).toBe(0);
    toggleSwitchNode('test-switchBox');
    // El grafo propaga el estado de la fuente al actuador en el siguiente tick.
    step();
    step();
    expect(rotor.linvel().x).toBeGreaterThan(0);
    expect(rotor.linvel().y).toBeCloseTo(0);
    const speed = rotor.linvel().x;
    toggleSwitchNode('test-switchBox');
    step();
    const speedAfterLastSignal = rotor.linvel().x;
    expect(speedAfterLastSignal).toBeGreaterThan(speed);
    step();
    expect(rotor.linvel().x).toBeCloseTo(speedAfterLastSignal);
  }));

it('solo aplica sustentación a un ala montada y dinámica', async () => {
  await rapier.init();
  const world = new rapier.World({ x: 0, y: 0, z: 0 });
  const id = 'test-wing-lift';
  const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 2, 0));
  const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.55, 0.07, 0.24).setMass(2.8), body);
  grabbableRegistry.register({
    id, kind: 'wing', initialPos: [0, 2, 0],
    getBody: () => body, getCollider: () => collider, getVisualGroup: () => null,
    getWorldPos: (out) => Boolean(out.copy(body.translation())),
  });
  try {
    world.step();
    body.setLinvel({ x: 0, y: 0, z: 6 }, true);
    stepContraptionLogic(1 / 60, {}, () => false, undefined, () => false);
    expect(body.linvel().y).toBe(0);
    stepContraptionLogic(1 / 60, {}, () => false, undefined, (partId) => partId === id);
    expect(body.linvel().y).toBeGreaterThan(0);
  } finally {
    grabbableRegistry.unregister(id);
    world.free();
  }
});

it.each(PRESET_BLUEPRINTS)('restaura $name con juntas y cableado', async (preset) => {
  await rapier.init();
  const world = new rapier.World({ x: 0, y: -18, z: 0 });
  const assembly = new WorkshopAssembly();
  const graph = new LogicGraph();
  const physics = createWorkshopPhysics({ rapier, world }, (id) => graph.hasIncoming(id) ? graph.getOutput(id) : undefined);
  const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN));
  world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0), cart);
  const wheelRotation = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
  const colliders: Partial<Record<GrabbableKind, () => rapier.ColliderDesc>> = {
    wheel: () => rapier.ColliderDesc.cylinder(0.14, 0.38).setRotation(wheelRotation),
    part: () => rapier.ColliderDesc.cuboid(0.27, 0.23, 0.23),
    battery: () => rapier.ColliderDesc.cuboid(0.27, 0.23, 0.23),
    wing: () => rapier.ColliderDesc.cuboid(0.55, 0.07, 0.24),
    seat: () => rapier.ColliderDesc.cuboid(0.25, 0.31, 0.26),
    thruster: () => rapier.ColliderDesc.cylinder(0.34, 0.16),
    canister: () => rapier.ColliderDesc.cylinder(0.38, 0.22),
    woodBarrel: () => rapier.ColliderDesc.cylinder(0.48, 0.36),
    headlight: () => rapier.ColliderDesc.cuboid(0.15, 0.17, 0.16),
    switchBox: () => rapier.ColliderDesc.cuboid(0.18, 0.14, 0.18),
    timerBox: () => rapier.ColliderDesc.cuboid(0.18, 0.14, 0.18),
    logicAnd: () => rapier.ColliderDesc.cuboid(0.18, 0.14, 0.18),
    magnet: () => rapier.ColliderDesc.cuboid(0.22, 0.16, 0.22),
    cargoRack: () => rapier.ColliderDesc.cuboid(0.46, 0.12, 0.36),
    spring: () => rapier.ColliderDesc.cylinder(0.22, 0.18),
    balloon: () => rapier.ColliderDesc.cylinder(0.34, 0.28),
    fan: () => rapier.ColliderDesc.cylinder(0.16, 0.26),
    horn: () => rapier.ColliderDesc.cuboid(0.18, 0.16, 0.24),
    gyro: () => rapier.ColliderDesc.cuboid(0.2, 0.2, 0.2),
    crate: () => rapier.ColliderDesc.cuboid(0.32, 0.3, 0.32),
  };
  try {
    for (const [index, part] of preset.parts.entries()) {
      const { partId: id, kind } = part;
      const initialPos: [number, number, number] = [index, 0.9, 0];
      const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(...initialPos));
      const collider = world.createCollider(colliders[kind]!().setMass(3), body);
      grabbableRegistry.register({
        id, kind, initialPos,
        getBody: () => body, getCollider: () => collider, getVisualGroup: () => null,
        getWorldPos: (out) => Boolean(out.copy(body.translation())),
      });
    }
    const restore = (unavailable: string[], repairAt?: readonly [number, number, number], stored?: ReadonlySet<string>) =>
      restoreCartBlueprint(preset, cart, assembly, physics, graph, { world, rapier }, new Set(unavailable), repairAt, stored);
    world.step();
    const testPartId = preset.rootPartId
      ? preset.parts.find((p) => p.partId !== preset.rootPartId)!.partId
      : 'wheel-1';
    const secondPartId = preset.rootPartId
      ? preset.parts.find((p) => p.partId !== preset.rootPartId && p.partId !== testPartId)!.partId
      : 'wheel-2';
    const expectedJoints = preset.rootPartId ? preset.parts.length - 1 : preset.parts.length;
    const station = preset.rootPartId ? (`custom:${preset.rootPartId}` as const) : 'cart';
    const rootEntry = preset.rootPartId ? grabbableRegistry.getById(preset.rootPartId)!.getBody()! : cart;
    const origin = preset.rootPartId ? FREE_BUILD_ORIGIN : WORKSHOP_ORIGIN;

    expect(restore([testPartId])).not.toBeNull();
    expect(world.impulseJoints.len()).toBe(0);
    expect(graph.getWires()).toHaveLength(0);
    expect(restore([])).toBeNull();
    graph.evaluate(1 / 60, { keys: { KeyW: true, Space: true } });
    graph.evaluate(1 / 60, { keys: { KeyW: true, Space: true } });
    if (preset.parts.some((p) => p.partId === 'thruster-1') && !preset.parts.some((p) => p.kind === 'timerBox')) {
      expect(graph.getOutput('thruster-1')).toBe(1);
    }
    expect(world.impulseJoints.len()).toBe(expectedJoints);
    const saved = captureCartBlueprint('Mi plano', assembly, physics, graph, station);
    expect(saved?.parts.map((part) => part.slotId)).toEqual(preset.parts.map((part) => part.slotId));
    expect(saved?.logic.wires).toHaveLength(preset.logic.wires.length);
    physics.toggleAssembly(station, rootEntry, assembly);
    expect(restore([testPartId])).not.toBeNull();
    expect(physics.isReleased(station)).toBe(true);
    expect(world.impulseJoints.len()).toBe(expectedJoints);
    expect(graph.getWires()).toHaveLength(preset.logic.wires.length);
    expect(restore([])).toBeNull();
    expect(physics.isReleased(station)).toBe(false);
    expect(world.impulseJoints.len()).toBe(expectedJoints);
    expect(graph.getWires()).toHaveLength(preset.logic.wires.length);
    const repairAt = [origin[0] + 8, origin[1], origin[2]] as const;
    const blockerHeight = preset.rootPartId
      ? preset.parts.find((p) => p.partId === preset.rootPartId)!.localPos[1]
      : 0.36;
    const blocker = world.createCollider(rapier.ColliderDesc.cuboid(0.12, 0.05, 0.15)
      .setTranslation(repairAt[0], repairAt[1] + blockerHeight, repairAt[2]));
    world.step();
    expect(restore([], repairAt)).toBe('Liberá el punto de reparación en el taller');
    expect(rootEntry.translation().x).toBeCloseTo(origin[0]);
    expect(world.impulseJoints.len()).toBe(expectedJoints);
    world.removeCollider(blocker, true);
    expect(restore([], repairAt)).toBeNull();
    expect(rootEntry.translation().x).toBeCloseTo(repairAt[0]);
    for (const id of assembly.remove(testPartId)) physics.detach(id);
    const stored = grabbableRegistry.getById(testPartId)!.getBody()!;
    stored.setEnabled(false);
    const retrieval = new Set([testPartId]);
    expect(restore([testPartId, secondPartId], repairAt, retrieval)).not.toBeNull();
    expect(stored.isEnabled()).toBe(false);
    expect(restore([testPartId], repairAt, retrieval)).toBeNull();
    expect(stored.isEnabled()).toBe(true);
  } finally {
    for (const part of preset.parts) grabbableRegistry.unregister(part.partId);
    world.free();
  }
});

it('un cable activa el motor con un interruptor y puede quitarse sin desmontar las ruedas', async () => {
  await rapier.init();
  const world = new rapier.World({ x: 0, y: 0, z: 0 });
  const assembly = new WorkshopAssembly();
  const physics = createWorkshopPhysics({ rapier, world }, getWiredEngineSignal, getMotorDirection);
  const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN));
  world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0).setMass(14), cart);
  const ids: string[] = [];

  function part(id: string, kind: GrabbableKind, position: { x: number; y: number; z: number }) {
    const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z));
    const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.2, 0.2, 0.2).setMass(3), body);
    ids.push(id);
    grabbableRegistry.register({
      id, kind, initialPos: [position.x, position.y, position.z],
      getBody: () => body,
      getCollider: () => collider,
      getVisualGroup: () => null,
      getWorldPos: (out: Vector3) => Boolean(out.copy(body.translation())),
    });
    return body;
  }

  const motorSlot = WORKSHOP_SLOTS.find(({ id }) => id === 'engine_front')!;
  const wheelSlot = WORKSHOP_SLOTS.find(({ id }) => id === 'wheel_fl')!;
  const motor = part('test-motor', 'part', getWorkshopSlotPose(motorSlot, cart).position);
  const wheel = part('test-wheel', 'wheel', getWorkshopSlotPose(wheelSlot, cart).position);
  const thrusterSlot = WORKSHOP_SLOTS.find(({ id }) => id === 'thruster_rear')!;
  const thrusterPose = getWorkshopSlotPose(thrusterSlot, cart);
  const thruster = part('test-thruster', 'thruster', thrusterPose.position);
  thruster.setRotation(thrusterPose.rotation, true);
  part('test-light', 'headlight', { x: -3, y: 0, z: 0 });
  part('test-switch', 'crate', { x: -1, y: 0, z: 0 });
  part('test-battery', 'battery', { x: -2, y: 0, z: 0 });

  try {
    assembly.mount('test-motor', motorSlot, 'engine');
    assembly.mount('test-wheel', wheelSlot, 'wheel');
    physics.attach('test-motor', motorSlot, motor, cart);
    physics.attach('test-wheel', wheelSlot, wheel, cart);

    const drive = (throttle: number) => {
      physics.updateMotors(assembly, { station: 'cart', throttle });
      for (let frame = 0; frame < 30; frame++) world.step();
      expect(world.impulseJoints.len()).toBe(2);
      expect(new Vector3().copy(wheel.translation()).distanceTo(getWorkshopSlotPose(wheelSlot, cart).position)).toBeLessThan(0.03);
    };
    drive(1);
    expect(wheel.angvel().x).toBeGreaterThan(1);
    drive(0);
    expect(physics.isDrivenWheel('test-wheel')).toBe(false);
    expect(Math.abs(wheel.angvel().x)).toBeLessThan(0.75);
    drive(-1);
    expect(wheel.angvel().x).toBeLessThan(-1);

    expect(invertMotorNode('test-motor')).toBe('Giro invertido');
    drive(1);
    expect(wheel.angvel().x).toBeLessThan(-1);
    expect(invertMotorNode('test-motor')).toBe('Giro normal');
    expect(invertMotorNode('test-wheel')).toBe('Giro invertido');
    drive(1);
    expect(wheel.angvel().x).toBeLessThan(-1);
    expect(invertMotorNode('test-wheel')).toBe('Giro normal');

    pulseActuator('test-light');
    stepContraptionLogic(0.25, {}, physics.isDrivenWheel);
    expect(getPartLogicOutput('test-light')).toBe(1);
    expect(contraptionGraph.getOutput('test-light')).toBe(0);
    stepContraptionLogic(0.41, {}, physics.isDrivenWheel);
    expect(getPartLogicOutput('test-light')).toBe(0);

    expect(stepWireConnection('test-motor').status).toBe('invalid');
    gameStore.toggleWrench();
    expect(stepWireConnection('test-switch').status).toBe('pending');
    gameStore.toggleWrench();
    expect(stepWireConnection('test-motor').status).toBe('invalid');
    expect(stepWireConnection('test-switch').status).toBe('pending');
    expect(describeWireDestination('test-switch', 'test-motor', 'part')).toEqual({ label: 'Señal', blocked: null });
    expect(stepWireConnection('test-motor').status).toBe('connected');
    expect(isPartWired('test-motor')).toBe(true);
    const step = () => {
      stepContraptionLogic(1 / 60, {}, physics.isDrivenWheel);
      physics.updateMotors(assembly);
      world.step();
    };
    for (let frame = 0; frame < 30; frame++) step();
    expect(physics.isDrivenWheel('test-wheel')).toBe(true);
    expect(Math.abs(wheel.angvel().x)).toBeGreaterThan(1);

    expect(stepWireConnection('test-switch').status).toBe('pending');
    expect(stepWireConnection('test-switch').status).toBe('invalid');
    expect(stepWireConnection(null).status).toBe('cancelled');
    expect(toggleSwitchNode('test-switch')).toBe('Interruptor apagado');
    step();
    step();
    expect(getWiredEngineSignal('test-motor')).toBe(0);
    expect(physics.isDrivenWheel('test-wheel')).toBe(false);
    expect(world.impulseJoints.len()).toBe(2);

    expect(stepWireConnection('test-battery').status).toBe('pending');
    expect(stepWireConnection('test-light').status).toBe('connected');
    expect(stepWireConnection('test-battery').status).toBe('pending');
    expect(stepWireConnection('test-thruster').status).toBe('connected');
    expect(assembly.mount('test-thruster', thrusterSlot, 'thruster')).toBe(true);
    physics.attach('test-thruster', thrusterSlot, thruster, cart);
    for (let frame = 0; frame < 10; frame++) step();
    expect(getPartLogicOutput('test-light')).toBe(1);
    expect(new Quaternion().copy(thruster.rotation()).angleTo(new Quaternion().copy(thrusterPose.rotation))).toBeLessThan(0.03);
    expect(new Vector3(0, 1, 0).applyQuaternion(new Quaternion().copy(thruster.rotation())).z).toBeGreaterThan(0.95);
    physics.toggleCart(cart, assembly);
    for (let frame = 0; frame < 30; frame++) step();
    expect(cart.linvel().z).toBeGreaterThan(0.2);
    expect(world.impulseJoints.len()).toBe(3);

    expect(stepWireConnection('test-switch').status).toBe('pending');
    expect(describeWireDestination('test-switch', 'test-motor', 'part')).toEqual({ label: 'Señal', blocked: 'Ya conectado' });
    expect(stepWireConnection('test-motor').status).toBe('invalid');
    expect(isPartWired('test-motor')).toBe(true);
    disconnectAllWires('test-switch');
    expect(stepWireConnection('test-battery').status).toBe('pending');
    expect(describeWireDestination('test-battery', 'test-motor', 'part')).toEqual({ label: 'Alimentación', blocked: null });
    expect(stepWireConnection('test-motor').status).toBe('connected');
    step();
    step();
    expect(getWiredEngineSignal('test-motor')).toBe(1);
    expect(physics.isDrivenWheel('test-wheel')).toBe(true);
    expect(world.impulseJoints.len()).toBe(3);
  } finally {
    resetContraptionGraph();
    for (const id of ids) grabbableRegistry.unregister(id);
    world.free();
  }
});

it('encadena una pieza a un accesorio y retira sus juntas dependientes al desmontarlo', async () => {
  await rapier.init();
  const world = new rapier.World({ x: 0, y: -18, z: 0 });
  const assembly = new WorkshopAssembly();
  const physics = createWorkshopPhysics({ rapier, world });
  const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN));
  world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0), cart);
  const slot = WORKSHOP_SLOTS.find(({ id }) => id === 'seat_center')!;
  const { position, rotation } = getWorkshopSlotPose(slot, cart);
  const seat = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(rotation));
  world.createCollider(rapier.ColliderDesc.cuboid(0.25, 0.31, 0.26).setMass(3.6), seat);
  const lampAt = new Vector3().copy(position).add(new Vector3(0, 0.51, 0));
  const lamp = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(lampAt.x, lampAt.y, lampAt.z).setRotation(rotation));
  world.createCollider(rapier.ColliderDesc.cuboid(0.15, 0.17, 0.16).setMass(2), lamp);

  try {
    expect(assembly.mount('seat', slot, 'seat')).toBe(true);
    physics.attach('seat', slot, seat, cart);
    const attachment = assembly.mountOnPart('lamp', 'seat', 'headlight');
    expect(attachment).not.toBeNull();
    physics.attachOnPart('lamp', attachment!, lamp, seat, lampAt, rotation);
    for (let frame = 0; frame < 24; frame++) world.step();
    expect(lamp.translation().y - seat.translation().y).toBeCloseTo(0.51, 2);
    expect(world.impulseJoints.len()).toBe(2);
    for (const id of assembly.remove('seat')) physics.detach(id);
    expect(assembly.isMounted('lamp')).toBe(false);
    expect(world.impulseJoints.len()).toBe(0);
  } finally {
    world.free();
  }
});
