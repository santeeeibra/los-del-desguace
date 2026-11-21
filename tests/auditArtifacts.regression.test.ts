import rapier from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { stockedPartPosition } from '../src/environment/workshopLayout';
import { captureCartBlueprint, restoreCartBlueprint } from '../src/invention/cartBlueprints';
import {
  WORKSHOP_ORIGIN,
  WORKSHOP_PARTS,
  WORKSHOP_SLOTS,
  WorkshopAssembly,
} from '../src/invention/workshopAssembly';
import { createWorkshopPhysics, getWorkshopSlotPose } from '../src/invention/workshopPhysics';
import {
  PRESET_BLUEPRINTS,
  decodeBlueprintCode,
  encodeBlueprintCode,
} from '../src/logic/blueprintManager';
import {
  BOXING_REACH,
  PART_LOGIC_SPECS,
  boxingExtension,
  contraptionGraph,
  disconnectAllWires,
  getMotorDirection,
  getPartLogicOutput,
  getWiredEngineSignal,
  pulseActuator,
  resetContraptionGraph,
  setTimerPeriod,
  stepContraptionLogic,
  stepWireConnection,
  toggleSwitchNode,
} from '../src/logic/contraptionRegistry';
import { LogicGraph } from '../src/logic/logicGraph';
import { grabbableRegistry, type GrabbableKind } from '../src/props/grabbableRegistry';

async function withAuditWorld(
  gravityY: number,
  run: (ctx: {
    world: rapier.World;
    addProp: (
      id: string,
      kind: GrabbableKind,
      pos: [number, number, number],
      opts?: {
        mass?: number;
        friction?: number;
        halfExtents?: [number, number, number];
        fixed?: boolean;
      },
    ) => { body: rapier.RigidBody; collider: rapier.Collider };
  }) => void,
) {
  await rapier.init();
  const world = new rapier.World({ x: 0, y: gravityY, z: 0 });
  const ids: string[] = [];
  const addProp = (
    id: string,
    kind: GrabbableKind,
    pos: [number, number, number],
    opts: {
      mass?: number;
      friction?: number;
      halfExtents?: [number, number, number];
      fixed?: boolean;
    } = {},
  ) => {
    const desc = opts.fixed
      ? rapier.RigidBodyDesc.fixed().setTranslation(...pos)
      : rapier.RigidBodyDesc.dynamic().setTranslation(...pos);
    const body = world.createRigidBody(desc);
    const [hx, hy, hz] = opts.halfExtents ?? [0.22, 0.22, 0.22];
    const colDesc = rapier.ColliderDesc.cuboid(hx, hy, hz)
      .setMass(opts.mass ?? 3.5)
      .setFriction(opts.friction ?? 0.85);
    const collider = world.createCollider(colDesc, body);
    ids.push(id);
    grabbableRegistry.register({
      id,
      kind,
      initialPos: pos,
      getBody: () => body,
      getCollider: () => collider,
      getVisualGroup: () => null,
      getWorldPos: (out) => Boolean(out.copy(body.translation() as never)),
    });
    return { body, collider };
  };
  resetContraptionGraph();
  try {
    run({ world, addProp });
  } finally {
    ids.forEach((id) => grabbableRegistry.unregister(id));
    resetContraptionGraph();
    world.free();
  }
}

describe('Auditoría Taller El Yunke — Regresión Rapier (24 piezas y casos prioritarios)', () => {
  describe('1. Electroimán (magnet)', () => {
    it.fails('no debería atraer madera (caja y barril) igual que una pieza metálica a la misma distancia', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        addProp('mag', 'magnet', [0, 1, 0], { fixed: true });
        addProp('sw', 'switchBox', [-1, 1, 0], { fixed: true });
        const { body: metal } = addProp('metal', 'part', [2.2, 1, 0], { mass: 4.2 });
        const { body: crate } = addProp('wood-crate', 'crate', [0, 1, 2.2], { mass: 14 });
        const { body: barrel } = addProp('wood-barrel', 'woodBarrel', [0, 1, -2.2], { mass: 6 });

        stepWireConnection('sw');
        stepWireConnection('mag');
        toggleSwitchNode('sw');
        for (let i = 0; i < 30; i++) {
          stepContraptionLogic(1 / 60, {}, () => false);
          world.step();
        }
        expect(metal.linvel().x).toBeLessThan(-0.5);
        // Comportamiento esperado por diseño: madera no debería ser atraída por un imán.
        expect(Math.abs(crate.linvel().z)).toBeLessThan(0.01);
        expect(Math.abs(barrel.linvel().z)).toBeLessThan(0.01);
      }));

    it.fails('una pared sólida intermedia debería bloquear la atracción del electroimán', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        addProp('mag', 'magnet', [0, 1, 0], { fixed: true });
        addProp('sw', 'switchBox', [-1, 1, 0], { fixed: true });
        const { body: metal } = addProp('metal', 'part', [2.4, 1, 0], { mass: 4.2 });
        world.createCollider(rapier.ColliderDesc.cuboid(0.15, 2, 2).setTranslation(1.2, 1, 0));

        stepWireConnection('sw');
        stepWireConnection('mag');
        toggleSwitchNode('sw');
        for (let i = 0; i < 20; i++) {
          stepContraptionLogic(1 / 60, {}, () => false);
          world.step();
        }
        // Esperado: pared bloquea atracción (velocidad hacia el imán = 0). Actual: atrae a través de la pared.
        expect(Math.abs(metal.linvel().x)).toBeLessThan(0.01);
      }));

    it.fails('no debería añadir impulso vertical (+Y) artificial a un objeto nivelado con el imán', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        addProp('mag', 'magnet', [0, 1, 0], { fixed: true });
        addProp('sw', 'switchBox', [-1, 1, 0], { fixed: true });
        const { body: metal } = addProp('metal', 'part', [2.0, 1, 0], { mass: 4.2 });

        stepWireConnection('sw');
        stepWireConnection('mag');
        toggleSwitchNode('sw');
        for (let i = 0; i < 20; i++) {
          stepContraptionLogic(1 / 60, {}, () => false);
          world.step();
        }
        // Esperado: sin elevación vertical artificial si dy === 0. Actual: añade +3*dt en Y.
        expect(Math.abs(metal.linvel().y)).toBeLessThan(0.01);
      }));

    it('respeta pieza montada, límite de alcance (3.6m) y corta el impulso al apagar la señal', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        addProp('mag', 'magnet', [0, 1, 0], { fixed: true });
        addProp('sw', 'switchBox', [-1, 1, 0], { fixed: true });
        const { body: mounted } = addProp('mounted', 'part', [1.5, 1, 0], { mass: 4.2 });
        const { body: inRange } = addProp('near', 'part', [3.5, 1, 0], { mass: 4.2 });
        const { body: outRange } = addProp('far', 'part', [0, 1, 3.7], { mass: 4.2 });

        stepWireConnection('sw');
        stepWireConnection('mag');
        toggleSwitchNode('sw');
        for (let i = 0; i < 10; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => id === 'mounted');
          world.step();
        }
        expect(mounted.linvel().x).toBe(0);
        expect(inRange.linvel().x).toBeLessThan(-0.1);
        expect(outRange.linvel().z).toBe(0);

        toggleSwitchNode('sw');
        stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => id === 'mounted');
        const speedAfterCut = inRange.linvel().x;
        for (let i = 0; i < 10; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => id === 'mounted');
          world.step();
        }
        expect(inRange.linvel().x).toBeCloseTo(speedAfterCut, 3);
      }));
  });

  describe('2. Propulsores (thruster, canister, fan, droneRotor)', () => {
    it.fails('bidón propulsor cableado debería mantener coherencia con su fuerza en Turbo (actual: 28 vs 420, 15x)', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const rot90 = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
        const { body: wiredCan } = addProp('can-wired', 'canister', [0, 1, 0], { mass: 4.5 });
        const { body: turboCan } = addProp('can-turbo', 'canister', [2, 1, 0], { mass: 4.5 });
        addProp('sw', 'switchBox', [-1, 1, 0], { fixed: true });
        wiredCan.setRotation(rot90, true);
        turboCan.setRotation(rot90, true);
        world.step();

        stepWireConnection('sw');
        stepWireConnection('can-wired');
        toggleSwitchNode('sw');
        // Un tick para propagar señal en LogicGraph
        stepContraptionLogic(1 / 60, {}, () => false, undefined, () => true);
        world.step();

        wiredCan.setLinvel({ x: 0, y: 0, z: 0 }, true);
        turboCan.setLinvel({ x: 0, y: 0, z: 0 }, true);
        stepContraptionLogic(1 / 60, {}, () => false, ['can-turbo'], () => true);
        world.step();

        const ratio = turboCan.linvel().z / Math.max(1e-6, wiredCan.linvel().z);
        // Esperado: relación razonable (<= 2x). Actual: 420 / 28 = 15x.
        expect(ratio).toBeLessThanOrEqual(2);
      }));

    it.fails('hélice de dron debería clasificarse como propulsión de vuelo y responder a Turbo', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const assembly = new WorkshopAssembly();
        addProp('base', 'woodBarrel', [0, 1, 0], { mass: 6 });
        const { body: rotor } = addProp('rotor', 'droneRotor', [0, 1.6, 0], { mass: 1.4 });
        assembly.mountOnPart('rotor', 'base', WORKSHOP_PARTS.droneRotor ?? 'fixture');
        world.step();

        stepContraptionLogic(1 / 60, {}, () => false, ['rotor'], () => true);
        world.step();

        expect(WORKSHOP_PARTS.droneRotor).toBeDefined();
        expect(assembly.hasFlightPropulsion('custom:base')).toBe(true);
        expect(rotor.linvel().y).toBeGreaterThan(0.1);
      }));

    it.fails('actuadores en base custom sin ruedas no deberían quedar anulados por skipForcesFor sin piloto sentado', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });
        const { body: barrel } = addProp('barrel', 'woodBarrel', [0, 2, 0], { mass: 6, fixed: true });
        const { body: thruster } = addProp('thr', 'thruster', [0, 2.7, 0], { mass: 3.8 });
        const m = assembly.mountOnPart('thr', 'barrel', 'thruster', undefined, 'fixture')!;
        physics.attachOnPart('thr', m, thruster, barrel, thruster.translation(), thruster.rotation());
        physics.toggleAssembly('custom:barrel', barrel, assembly);
        world.step();

        // Replica exactamente el predicado skipForcesFor de PlayerRig.tsx:344-354 sin piloto (seated = null)
        const playerRigSkipForces = (id: string) => {
          const partStation = assembly.stationOf(id);
          if (!partStation) return false;
          if (partStation !== 'drum' && !physics.isReleased(partStation)) return true;
          if (grabbableRegistry.getById(id)?.kind === 'droneRotor') return false;
          if (partStation.startsWith('custom:') && !assembly.hasWheels(partStation)) return true;
          return false;
        };

        pulseActuator('thr');
        for (let i = 0; i < 15; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => assembly.isMounted(id), playerRigSkipForces);
          world.step();
        }
        // Esperado: "Probar" en un cohete sobre base libre sin ruedas empuja el invento. Actual: 0 por skipForcesFor.
        expect(barrel.linvel().y).toBeGreaterThan(0.5);
      }));

    it('hélice de dron descentrada genera torque y dos equilibradas suben niveladas (y 0 con señal apagada)', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });

        // 1) Una hélice descentrada en X = +0.7
        const { body: base1 } = addProp('base1', 'crate', [0, 2, 0], { mass: 6, fixed: true });
        const { body: r1 } = addProp('r1', 'droneRotor', [0.7, 2.35, 0], { mass: 1.4 });
        const m1 = assembly.mountOnPart('r1', 'base1', 'fixture')!;
        physics.attachOnPart('r1', m1, r1, base1, r1.translation(), r1.rotation());
        physics.toggleAssembly('custom:base1', base1, assembly);

        // 2) Dos hélices simétricas en X = ±0.7
        const { body: base2 } = addProp('base2', 'crate', [5, 2, 0], { mass: 6, fixed: true });
        const { body: r2a } = addProp('r2a', 'droneRotor', [4.3, 2.35, 0], { mass: 1.4 });
        const { body: r2b } = addProp('r2b', 'droneRotor', [5.7, 2.35, 0], { mass: 1.4 });
        const m2a = assembly.mountOnPart('r2a', 'base2', 'fixture')!;
        const m2b = assembly.mountOnPart('r2b', 'base2', 'fixture')!;
        physics.attachOnPart('r2a', m2a, r2a, base2, r2a.translation(), r2a.rotation());
        physics.attachOnPart('r2b', m2b, r2b, base2, r2b.translation(), r2b.rotation());
        physics.toggleAssembly('custom:base2', base2, assembly);

        // Con señal apagada no hay empuje ni giro
        for (let i = 0; i < 15; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => assembly.isMounted(id));
          world.step();
        }
        expect(Math.abs(base1.linvel().y)).toBeLessThan(0.01);
        expect(Math.abs(base2.linvel().y)).toBeLessThan(0.01);

        // Con pulso activo: descentrada rota en Z, equilibrada mantiene angvel.z ≈ 0
        pulseActuator('r1');
        pulseActuator('r2a');
        pulseActuator('r2b');
        for (let i = 0; i < 20; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => assembly.isMounted(id));
          world.step();
        }
        expect(Math.abs(base1.angvel().z)).toBeGreaterThan(0.3);
        expect(Math.abs(base2.angvel().z)).toBeLessThan(0.05);
        expect(base2.linvel().y).toBeGreaterThan(base1.linvel().y);
      }));
  });

  describe('3. Puño de resorte (boxingGlove) y Bandera (flag)', () => {
    it('puño golpea solo adelante sin pared, ignora costado y atrás, respeta intervalo 0.8s y 1 ciclo visual', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const { body: glove } = addProp('glove', 'boxingGlove', [0, 1, 0], { mass: 3 });
        const { body: front } = addProp('front', 'crate', [0, 1, 1.0], { mass: 5 });
        const { body: side } = addProp('side', 'crate', [1.0, 1, 0], { mass: 5 });
        const { body: behind } = addProp('behind', 'crate', [0, 1, -1.0], { mass: 5 });
        addProp('sw', 'switchBox', [-2, 1, 0], { fixed: true });

        const rayFind = (_id: string, source: rapier.RigidBody, dir: Vector3) =>
          world.castRay(new rapier.Ray(source.translation(), dir), BOXING_REACH, true, undefined, undefined, undefined, source)?.collider.parent() ?? null;

        stepWireConnection('sw');
        stepWireConnection('glove');
        toggleSwitchNode('sw');
        world.step();

        // Tick 1 propaga señal, tick 2 dispara primer golpe
        stepContraptionLogic(1 / 60, {}, () => false, undefined, undefined, undefined, rayFind);
        stepContraptionLogic(1 / 60, {}, () => false, undefined, undefined, undefined, rayFind);
        expect(front.linvel().z).toBeGreaterThan(2);
        expect(glove.linvel().z).toBeLessThan(-2); // retroceso en base libre
        expect(side.linvel().x).toBe(0);
        expect(behind.linvel().z).toBe(0);

        // Animación se extiende y retrae en 0.27s; no vuelve a golpear antes de 0.8s
        stepContraptionLogic(0.05, {}, () => false, undefined, undefined, undefined, rayFind);
        expect(boxingExtension('glove')).toBeGreaterThan(0.5);
        const speedAfterFirst = front.linvel().z;
        stepContraptionLogic(0.3, {}, () => false, undefined, undefined, undefined, rayFind);
        expect(boxingExtension('glove')).toBe(0);
        expect(front.linvel().z).toBeCloseTo(speedAfterFirst, 3);
      }));

    it('bandera soldada acompaña traslación y rotación 90° de la base sin aplicar fuerzas', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });
        const { body: base } = addProp('base', 'crate', [0, 1, 0], { mass: 14, fixed: true });
        const { body: flag } = addProp('flag', 'flag', [0, 1.65, 0.2], { mass: 0.6 });
        const m = assembly.mountOnPart('flag', 'base', 'fixture')!;
        physics.attachOnPart('flag', m, flag, base, flag.translation(), flag.rotation());

        expect(physics.rotateAssembly('custom:base', base, Math.PI / 2)).toBe(true);
        expect(physics.moveAssembly('custom:base', base, { x: 1, y: 0, z: 0 })).toBe(true);
        expect(flag.translation().x).toBeCloseTo(1.2, 2);
        expect(flag.translation().z).toBeCloseTo(0, 2);

        physics.toggleAssembly('custom:base', base, assembly);
        for (let i = 0; i < 15; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => assembly.isMounted(id));
          world.step();
        }
        expect(Math.hypot(base.linvel().x, base.linvel().y, base.linvel().z)).toBeLessThan(0.01);
      }));
  });

  describe('4. Regresiones de lógica, energía, piezas que se activan solas y planos', () => {
    it.fails('caja apilable como interruptor no debería encender el actuador antes de activarla', () => {
      expect(PART_LOGIC_SPECS.crate?.defaultConfig?.active).toBe(false);
    });

    it.fails('conectar solo una batería al puerto power no debería activar el actuador sin señal de control', () => {
      const g = new LogicGraph();
      g.addNode('bat', 'battery', { charge: 1 });
      g.addNode('thr', 'thruster', { gain: 1 });
      g.connect('bat', 'thr', { toPort: 'power' });
      g.evaluate(1 / 60);
      g.evaluate(1 / 60);
      // Esperado: 0 porque no hay señal de control. Actual: 1 porque power cae en primary -> signalPort.
      expect(g.getOutput('thr')).toBe(0);
    });

    it.fails('motor sin cablear en carrito liberado sin conductor no debería arrancar solo al bajar del asiento', () =>
      withAuditWorld(-18, ({ world, addProp }) => {
        world.createCollider(rapier.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 6));
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier }, getWiredEngineSignal, getMotorDirection);
        const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN));
        world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0).setMass(14), cart);

        const engSlot = WORKSHOP_SLOTS.find((s) => s.id === 'engine_rear')!;
        const engPose = getWorkshopSlotPose(engSlot, cart);
        const { body: eng } = addProp('eng', 'part', [engPose.position.x, engPose.position.y, engPose.position.z], { mass: 4.2 });
        assembly.mount('eng', engSlot, 'engine');
        physics.attach('eng', engSlot, eng, cart);

        const wheelRot = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
        const wheels: rapier.RigidBody[] = [];
        for (const wSlot of WORKSHOP_SLOTS.filter((s) => s.type === 'wheel')) {
          const wPose = getWorkshopSlotPose(wSlot, cart);
          const wb = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(wPose.position.x, wPose.position.y, wPose.position.z));
          world.createCollider(rapier.ColliderDesc.cylinder(0.14, 0.38).setRotation(wheelRot).setMass(3.4), wb);
          assembly.mount(wSlot.id, wSlot, 'wheel');
          physics.attach(wSlot.id, wSlot, wb, cart);
          wheels.push(wb);
        }

        // Subir al asiento (withDriver = true, throttle = 0) y luego bajarse (driver = undefined)
        physics.toggleAssembly('cart', cart, assembly, true);
        for (let i = 0; i < 10; i++) {
          physics.updateMotors(assembly, { station: 'cart', throttle: 0 });
          world.step();
        }
        const zBeforeExit = cart.translation().z;
        for (let i = 0; i < 45; i++) {
          physics.updateMotors(assembly, undefined);
          world.step();
        }
        // Esperado: al bajarse del asiento con motor sin cablear, el carrito queda quieto.
        // Actual: updateMotors usa factor = engineDirection (1) -> SPIN_SPEED = 10 y el carrito se aleja solo.
        expect(Math.abs(cart.translation().z - zBeforeExit)).toBeLessThan(0.05);
        expect(Math.abs(wheels[2].angvel().x)).toBeLessThan(0.1);
      }));

    it.fails('resorte saltarín suelto no debería usar impulso de pieza montada (disparo > 50 m/s)', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const { body: spring } = addProp('sp', 'spring', [0, 1, 0], { mass: 2.6 });
        pulseActuator('sp');
        stepContraptionLogic(1 / 60, {}, () => false, undefined, () => false);
        world.step();
        // Actual: 165 / 2.6 ≈ 63.46 m/s (ignora MAX_LOOSE_THRUST_SPEED y factor 0.35).
        expect(spring.linvel().y).toBeLessThan(25);
      }));

    it.fails('restaurar un plano compartido en sesión limpia con una pieza del dispensador debería funcionar', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });
        const graph = new LogicGraph();
        const cart = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(...WORKSHOP_ORIGIN));
        world.createCollider(rapier.ColliderDesc.cuboid(0.65, 0.055, 1.12).setTranslation(0, 0.36, 0).setMass(14), cart);

        const { body: flag } = addProp('extra-flag-1', 'flag', [WORKSHOP_ORIGIN[0], WORKSHOP_ORIGIN[1] + 0.85, WORKSHOP_ORIGIN[2]], { mass: 0.6 });
        const mount = assembly.mountFreeOnCart('extra-flag-1', 'fixture')!;
        physics.attachOnPart('extra-flag-1', mount, flag, cart, flag.translation(), flag.rotation());

        const captured = captureCartBlueprint('Carrito con Bandera', assembly, physics, graph, 'cart')!;
        const decoded = decodeBlueprintCode(encodeBlueprintCode(captured))!;

        // Simula sesión limpia o reinicio: la pieza extra del dispensador ya no está registrada
        for (const id of assembly.remove('extra-flag-1')) physics.detach(id);
        grabbableRegistry.unregister('extra-flag-1');

        const err = restoreCartBlueprint(decoded, cart, assembly, physics, graph, { world, rapier }, new Set());
        expect(err).toBeNull();
      }));

    it.fails('preset-double-dragster no debería disparar cohete y bidón solos con acelerador en 0', () => {
      const preset = PRESET_BLUEPRINTS.find((p) => p.id === 'preset-double-dragster')!;
      const g = LogicGraph.fromJSON(preset.logic);
      g.evaluate(1 / 60, { keys: { KeyW: false, KeyS: false, Space: false } });
      g.evaluate(1 / 60, { keys: { KeyW: false, KeyS: false, Space: false } });
      expect(g.getOutput('thruster-1')).toBe(0);
      expect(g.getOutput('canister-1')).toBe(0);
    });

    it.fails('chasis-1 en la bandeja de repuestos no debería superponerse en Z con las piezas de la bandeja 0', () => {
      // chassis-1 es stockedPartPosition(12) con halfExtent Z = 0.95; canister-1 es stockedPartPosition(3) con radio 0.22
      const chassisPos = stockedPartPosition(12);
      const canisterPos = stockedPartPosition(3);
      const chassisFrontZ = chassisPos[2] + 0.95;
      const canisterBackZ = canisterPos[2] - 0.22;
      expect(chassisFrontZ).toBeLessThan(canisterBackZ);
    });
  });

  describe('5. Catálogo verificado en Rapier (ala, globo, lógica, bocina, soporte, apilado)', () => {
    it('ala: reposo = 0 sustentación, avance normal sube, avance invertida 180° empuja hacia abajo', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const { body: wing } = addProp('w', 'wing', [0, 3, 0], { mass: 2.8 });
        stepContraptionLogic(1 / 60, {}, () => false, undefined, () => true);
        expect(wing.linvel().y).toBe(0);

        wing.setLinvel({ x: 0, y: 0, z: 6 }, true);
        stepContraptionLogic(1 / 60, {}, () => false, undefined, () => true);
        expect(wing.linvel().y).toBeGreaterThan(0);

        wing.setLinvel({ x: 0, y: 0, z: 6 }, true);
        wing.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI), true);
        stepContraptionLogic(1 / 60, {}, () => false, undefined, () => true);
        expect(wing.linvel().y).toBeLessThan(0);
      }));

    it('globo suelto no despega solo al reiniciar (g=-18); montado distingue carga liviana vs pesada', () =>
      withAuditWorld(-18, ({ world, addProp }) => {
        world.createCollider(rapier.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0));
        const { body: loose } = addProp('b-loose', 'balloon', [0, 0.4, 0], { mass: 0.7, halfExtents: [0.28, 0.34, 0.28] });
        for (let i = 0; i < 60; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, () => false);
          world.step();
        }
        expect(loose.translation().y).toBeLessThan(0.8);

        // Compara carga liviana (flag 0.6kg) vs pesada (crate 14kg) con el mismo globo montado (sin skipForcesFor)
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });
        const { body: lightBase } = addProp('light', 'flag', [3, 0.5, 0], { mass: 0.6, fixed: true });
        const { body: bLight } = addProp('b-light', 'balloon', [3, 1.2, 0], { mass: 0.7 });
        const mL = assembly.mountOnPart('b-light', 'light', 'balloon')!;
        physics.attachOnPart('b-light', mL, bLight, lightBase, bLight.translation(), bLight.rotation());
        physics.toggleAssembly('custom:light', lightBase, assembly);

        const { body: heavyBase } = addProp('heavy', 'crate', [6, 0.5, 0], { mass: 14, fixed: true });
        const { body: bHeavy } = addProp('b-heavy', 'balloon', [6, 1.2, 0], { mass: 0.7 });
        const mH = assembly.mountOnPart('b-heavy', 'heavy', 'balloon')!;
        physics.attachOnPart('b-heavy', mH, bHeavy, heavyBase, bHeavy.translation(), bHeavy.rotation());
        physics.toggleAssembly('custom:heavy', heavyBase, assembly);

        for (let i = 0; i < 45; i++) {
          stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => assembly.isMounted(id));
          world.step();
        }
        expect(lightBase.translation().y).toBeGreaterThan(heavyBase.translation().y + 0.3);
      }));

    it('temporizador (0.6s / 1.4s / 3.0s) y desconexión + puerta AND (00/01/10/11)', () =>
      withAuditWorld(0, ({ addProp }) => {
        addProp('t1', 'timerBox', [0, 1, 0], { fixed: true });
        addProp('h1', 'headlight', [1, 1, 0], { fixed: true });
        stepWireConnection('t1');
        stepWireConnection('h1');

        for (const period of [0.6, 1.4, 3.0]) {
          setTimerPeriod('t1', period);
          const samples: number[] = [];
          const steps = Math.round((period * 1.1) / 0.05);
          for (let i = 0; i < steps; i++) {
            stepContraptionLogic(0.05, {}, () => false);
            samples.push(getPartLogicOutput('h1'));
          }
          expect(samples.some((v) => v === 1) && samples.some((v) => v === 0)).toBe(true);
        }
        disconnectAllWires('t1');
        stepContraptionLogic(0.05, {}, () => false);
        expect(getPartLogicOutput('h1')).toBe(0);

        // Puerta AND: 00, 01, 10, 11 -> solo 11 enciende el faro
        addProp('sA', 'switchBox', [2, 1, 0], { fixed: true });
        addProp('sB', 'switchBox', [3, 1, 0], { fixed: true });
        addProp('and1', 'logicAnd', [4, 1, 0], { fixed: true });
        addProp('h2', 'headlight', [5, 1, 0], { fixed: true });
        stepWireConnection('sA'); stepWireConnection('and1');
        stepWireConnection('sB'); stepWireConnection('and1');
        stepWireConnection('and1'); stepWireConnection('h2');

        const evalAnd = () => {
          for (let i = 0; i < 4; i++) stepContraptionLogic(1 / 60, {}, () => false);
          return getPartLogicOutput('h2');
        };
        expect(evalAnd()).toBe(0); // 00
        toggleSwitchNode('sA');
        expect(evalAnd()).toBe(0); // 10
        toggleSwitchNode('sB');
        expect(evalAnd()).toBe(1); // 11
        toggleSwitchNode('sA');
        expect(evalAnd()).toBe(0); // 01
      }));

    it('bocina empuja pieza libre cercana pero no a pieza soldada a su propia base', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        addProp('horn', 'horn', [0, 1, 0], { fixed: true });
        const { body: freePiece } = addProp('free', 'part', [1.5, 1, 0], { mass: 4.2 });
        const { body: weldedPiece } = addProp('welded', 'part', [-1.5, 1, 0], { mass: 4.2 });

        pulseActuator('horn');
        stepContraptionLogic(1 / 60, {}, () => false, undefined, (id) => id === 'welded' || id === 'horn');
        world.step();

        expect(freePiece.linvel().x).toBeGreaterThan(1.5);
        expect(weldedPiece.linvel().x).toBe(0);
      }));

    it('cajas apilables se sostienen entre sí y el soporte de carga diferencia carga apoyada vs soldada al frenar', () =>
      withAuditWorld(-18, ({ world, addProp }) => {
        world.createCollider(rapier.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0));
        const { body: c1 } = addProp('c1', 'crate', [0, 0.3, 0], { mass: 14, friction: 1.15, halfExtents: [0.32, 0.3, 0.32] });
        const { body: c2 } = addProp('c2', 'crate', [0, 0.92, 0], { mass: 14, friction: 1.15, halfExtents: [0.32, 0.3, 0.32] });
        for (let i = 0; i < 90; i++) world.step();
        expect(c2.translation().y).toBeGreaterThan(c1.translation().y + 0.55);

        // Soporte de carga: carga apoyada desliza en frenada brusca vs carga soldada que acompaña
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });
        const { body: rack } = addProp('rack', 'cargoRack', [5, 0.12, 0], { mass: 10, friction: 0.4, halfExtents: [0.46, 0.12, 0.36] });
        const { body: resting } = addProp('rest', 'crate', [4.8, 0.56, 0], { mass: 2, friction: 0.25, halfExtents: [0.18, 0.18, 0.18] });
        const { body: welded } = addProp('weld', 'crate', [5.2, 0.56, 0], { mass: 2, friction: 0.25, halfExtents: [0.18, 0.18, 0.18] });
        const mW = assembly.mountOnPart('weld', 'rack', 'fixture')!;
        physics.attachOnPart('weld', mW, welded, rack, welded.translation(), welded.rotation());
        for (let i = 0; i < 15; i++) world.step();

        // Velocidad inicial + frenada repentina del rack
        rack.setLinvel({ x: 0, y: 0, z: 8 }, true);
        resting.setLinvel({ x: 0, y: 0, z: 8 }, true);
        welded.setLinvel({ x: 0, y: 0, z: 8 }, true);
        world.step();
        rack.setLinvel({ x: 0, y: 0, z: 0 }, true);
        for (let i = 0; i < 20; i++) world.step();

        const restingDrift = Math.abs(resting.translation().z - rack.translation().z);
        const weldedDrift = Math.abs(welded.translation().z - rack.translation().z);
        expect(restingDrift).toBeGreaterThan(weldedDrift + 0.25);
      }));

    it('giroscopio estabiliza una creación sin ruedas inclinada 30° sin saltos bruscos de posición (vs sin giroscopio)', () =>
      withAuditWorld(0, ({ world, addProp }) => {
        const assembly = new WorkshopAssembly();
        const physics = createWorkshopPhysics({ world, rapier });
        const tiltAxis = new Vector3(1, 0, 0);
        const tiltAngle = (30 * Math.PI) / 180;

        const { body: withGyro } = addProp('g-base', 'woodBarrel', [0, 2, 0], { mass: 6, fixed: true });
        const { body: gyroPart } = addProp('g-part', 'gyro', [0, 2, -0.5], { mass: 2.6 });
        const mG = assembly.mountOnPart('g-part', 'g-base', 'gyro')!;
        physics.attachOnPart('g-part', mG, gyroPart, withGyro, gyroPart.translation(), gyroPart.rotation());
        expect(physics.rotateAssembly('custom:g-base', withGyro, tiltAngle, tiltAxis)).toBe(true);
        physics.toggleAssembly('custom:g-base', withGyro, assembly);

        const { body: noGyro } = addProp('ng-base', 'woodBarrel', [4, 2, 0], { mass: 6, fixed: true });
        const { body: flagPart } = addProp('ng-part', 'flag', [4, 2, -0.5], { mass: 0.6 });
        const mNG = assembly.mountOnPart('ng-part', 'ng-base', 'fixture')!;
        physics.attachOnPart('ng-part', mNG, flagPart, noGyro, flagPart.translation(), flagPart.rotation());
        expect(physics.rotateAssembly('custom:ng-base', noGyro, tiltAngle, tiltAxis)).toBe(true);
        physics.toggleAssembly('custom:ng-base', noGyro, assembly);

        let maxPosJump = 0;
        let prevY = withGyro.translation().y;
        for (let i = 0; i < 60; i++) {
          physics.stabilizeAndFlyAssembly('custom:g-base', withGyro, { throttle: 0, steer: 0, ascend: false, descend: false }, 1 / 60, assembly);
          physics.stabilizeAndFlyAssembly('custom:ng-base', noGyro, { throttle: 0, steer: 0, ascend: false, descend: false }, 1 / 60, assembly);
          world.step();
          const curY = withGyro.translation().y;
          maxPosJump = Math.max(maxPosJump, Math.abs(curY - prevY));
          prevY = curY;
        }
        const upWithGyro = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().copy(withGyro.rotation())).y;
        const upNoGyro = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().copy(noGyro.rotation())).y;
        expect(upWithGyro).toBeGreaterThan(0.97);
        expect(upNoGyro).toBeLessThan(0.9);
        expect(maxPosJump).toBeLessThan(0.05);
      }));
  });
});
