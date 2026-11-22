import type { RapierCollider, RapierRigidBody, useRapier } from '@react-three/rapier';
import { Euler, Quaternion, Vector3 } from 'three';
import type { WorkshopAssembly, WorkshopMount, WorkshopSlot, WorkshopStation } from './workshopAssembly';
import { isCustomStation } from './workshopAssembly';
import { steerPivotLocal, WHEEL_RADIUS } from './platformShape';
import {
  BreakMonitor,
  hasBreakLimits,
  weightMultiple,
  WORLD_GRAVITY_Y,
  type BodyKinematics,
  type BreakLimits,
} from '../physics/jointLoad';
import { engineConditionFactor, getPartCondition } from '../props/partCondition';

type PhysicsContext = ReturnType<typeof useRapier>;
type ImpulseJoint = ReturnType<PhysicsContext['world']['createImpulseJoint']>;

export type MountLocalPose = { position: Vector3; rotation: Quaternion; axis?: Vector3 };

interface MountRecord {
  slot: WorkshopMount;
  joint: ImpulseJoint;
  createJoint: () => ImpulseJoint;
  body: RapierRigidBody;
  axleMount?: RapierRigidBody;
  /** Mangueta de una rueda de dirección (pivote vertical entre la pieza madre y el eje). */
  knuckle?: RapierRigidBody;
  parentBody?: RapierRigidBody;
  steer?: { joint: ImpulseJoint; min: number; max: number; target: number };
  speed: number;
  braking?: boolean;
  localPose?: MountLocalPose;
  /** Umbral opcional para que la unión se suelte por impacto o tensión (ver `stepBreakage`). */
  breakLimits?: BreakLimits;
}

/** Una batería descargada no entrega energía. */
const batteryUsable = (id: string) => getPartCondition(id) !== 'discharged';

function kinematicsOf(body: RapierRigidBody): BodyKinematics {
  const mass = body.mass();
  const principal = typeof body.principalInertia === 'function' ? body.principalInertia() : null;
  const inertia = principal ? (principal.x + principal.y + principal.z) / 3 : mass * 0.04;
  return { mass, linvel: body.linvel(), angvel: body.angvel(), inertia };
}

/** Recorrido por defecto de una rueda de dirección cuando nada la estorba. */
export const STEER_DEFAULT = 0.6;
const STEER_STIFFNESS = 24000;
const STEER_DAMPING = 1400;
/** Aceleración lateral máxima que pide la dirección (m/s²): a más velocidad, curva más abierta. */
const STEER_MAX_LATERAL = 9;
/** Piso de aceleración lateral para vehículos angostos (bici en fila, triciclo con la carga atrás). */
const STEER_MIN_LATERAL = 4.5;
/** Ancho de apoyo a la altura del centro de masa con el que se permite la aceleración lateral máxima (m). */
const STEER_REFERENCE_TRACK = 1.1;
/** Por debajo de este ancho de apoyo el vehículo recibe estabilizador de balanceo (m). */
const NARROW_TRACK = 0.6;
/** Distancia extra bajo la rueda para darla por apoyada en el piso (m). */
const GROUND_PROBE = 0.18;
/** Tiempo sin ruedas apoyadas antes de pasar al control de vuelo (salto de rampa corto = sigue en tierra). */
const AIR_ENTER_DELAY = 0.25;
const steerScratch = new Quaternion();
const steerScratch2 = new Quaternion();

/**
 * Regla general de montaje: una rueda soldada con eje lateral (izquierda-derecha de su pieza madre)
 * y adelante del centro de esa pieza se suelda con mangueta y dirige.
 */
export function qualifiesForSteering(
  localPoint: { x: number; z: number },
  localAxis: { x: number; y: number; z: number },
  /** z local del centro de masa del invento (en el marco de la pieza madre): dirigen las ruedas de adelante. */
  centerOfMassZ = 0,
) {
  return Math.abs(localAxis.x) > 0.9 && localPoint.z > centerOfMassZ + 0.12;
}

/**
 * Ancho del apoyo (casco de las ruedas en planta) a la altura del centro de masa. Los puntos van en el
 * marco del vehículo con el centro de masa en el origen (z hacia adelante). Una fila de ruedas da ~0,
 * un auto da su trocha, un triciclo da menos que su trocha trasera.
 */
export function supportWidthAtCenter(points: { x: number; z: number }[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    if (Math.abs(a.z) < 0.05) { lo = Math.min(lo, a.x); hi = Math.max(hi, a.x); }
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j];
      if ((a.z < 0) === (b.z < 0) || a.z === b.z) continue;
      const t = a.z / (a.z - b.z);
      const x = a.x + (b.x - a.x) * t;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
  }
  return hi > lo ? hi - lo : 0;
}

/** Aceleración lateral permitida según el ancho de apoyo: continua, sin casos especiales por tipo. */
export function steerLateralLimit(supportWidth: number): number {
  return Math.max(STEER_MIN_LATERAL, Math.min(STEER_MAX_LATERAL, STEER_MAX_LATERAL * supportWidth / STEER_REFERENCE_TRACK));
}

const CENTER = { x: 0, y: 0, z: 0 };
export const LEVEL_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const SPIN_SPEED = 10;
const VERTICAL = new Vector3(0, 1, 0);
const WHEEL_SPIN_AXIS = new Vector3(1, 0, 0);
const TURN_STEP = Math.PI / 4;
export const MANUAL_LIFT_LIMIT = 16;
const MANUAL_DRAG_LIMIT = 55;
const WHEEL_MOUNTED_FRICTION = 0.18;
const WHEEL_LOOSE_FRICTION = 0.95;

function setWheelFriction(body: RapierRigidBody | null | undefined, friction: number) {
  if (!body?.isValid()) return;
  for (let i = 0; i < body.numColliders(); i++) {
    body.collider(i).setFriction(friction);
  }
}

export function getWorkshopSlotPose(slot: WorkshopSlot, root: Pick<RapierRigidBody, 'translation' | 'rotation'> | null) {
  if (!root || slot.station !== 'cart') {
    return { position: slot.worldPosition, rotation: slot.mountRotation ?? LEVEL_ROTATION };
  }
  const rotation = new Quaternion().copy(root.rotation());
  const position = new Vector3(...slot.position).applyQuaternion(rotation).add(root.translation());
  if (slot.mountRotation) rotation.multiply(new Quaternion().copy(slot.mountRotation));
  return { position, rotation };
}

export function createWorkshopPhysics(
  { world, rapier }: Pick<PhysicsContext, 'world' | 'rapier'>,
  engineSignal?: (id: string) => number | undefined,
  motorDirection?: (id: string) => number,
  steerLimits?: (id: string, mount: WorkshopMount, pose: MountLocalPose) => { min: number; max: number } | undefined,
  /** Pivote propio de la mangueta (p. ej. el centro de la rueda en una horquilla). Si falta, se usa el borde de la rueda. */
  steerPivotFor?: (id: string, mount: WorkshopMount, pose: MountLocalPose) => { x: number; y: number; z: number } | null | undefined,
) {
  let anchor: RapierRigidBody | null = null;
  const mounts = new Map<string, MountRecord>();

  function applySteerLimits(record: MountRecord, limits: { min: number; max: number }) {
    const steer = record.steer;
    if (!steer || !steer.joint.isValid()) return;
    steer.min = Math.min(0, limits.min);
    steer.max = Math.max(0, limits.max);
    const joint = steer.joint as InstanceType<typeof rapier.RevoluteImpulseJoint>;
    // Con recorrido nulo la mangueta queda trabada en el centro.
    joint.setLimits(steer.min - 1e-3, steer.max + 1e-3);
    steer.target = Math.max(steer.min, Math.min(steer.max, steer.target));
    joint.configureMotorPosition(steer.target, STEER_STIFFNESS, STEER_DAMPING);
  }

  function steerAngle(record: MountRecord): number {
    if (!record.knuckle?.isValid() || !record.parentBody?.isValid()) return 0;
    const rel = steerScratch.copy(record.parentBody.rotation()).invert()
      .multiply(steerScratch2.copy(record.knuckle.rotation()));
    return 2 * Math.atan2(rel.y, rel.w);
  }
  const releasedStations = new Set<WorkshopStation>();
  const parkedParts = new Set<RapierRigidBody>();
  let bench: { root: RapierRigidBody; rotors: Set<string>; motors: Set<string> } | null = null;
  const benchAxis = new Vector3();
  const benchRotation = new Quaternion();
  /** Rumbo objetivo por estación para el vuelo libre (se reinicia si pasa un rato sin controlarse). */
  const flightHeading = new Map<WorkshopStation, { yaw: number; at: number }>();
  const flightTargetQuat = new Quaternion();
  const flightErrQuat = new Quaternion();
  const flightEuler = new Euler(0, 0, 0, 'YXZ');
  let flightClock = 0;
  const vehicleGroups = new Map<WorkshopStation, {
    bit: number;
    colliders: Map<number, { collider: RapierCollider; previous: number; owner: number }>;
  }>();

  function ignoreVehicleContacts(station: WorkshopStation, parent: RapierRigidBody, body: RapierRigidBody) {
    if (station === 'drum') return;
    let group = vehicleGroups.get(station);
    if (!group) {
      const used = new Set([...vehicleGroups.values()].map(({ bit }) => bit));
      let bit = 2;
      while (used.has(bit)) bit <<= 1;
      if (bit > 0x8000) return;
      group = { bit, colliders: new Map() };
      vehicleGroups.set(station, group);
    }
    const mask = ((group.bit << 16) | (0xffff ^ group.bit)) >>> 0;
    for (const member of [parent, body]) {
      for (let i = 0; i < member.numColliders(); i++) {
        const collider = member.collider(i);
        if (!group.colliders.has(collider.handle)) {
          group.colliders.set(collider.handle, { collider, previous: collider.collisionGroups(), owner: member.handle });
        }
        collider.setCollisionGroups(mask);
      }
    }
  }

  function restoreVehicleContacts(station: WorkshopStation, owner?: number) {
    const group = vehicleGroups.get(station);
    if (!group) return;
    for (const [handle, saved] of group.colliders) {
      if (owner !== undefined && owner !== saved.owner) continue;
      if (saved.collider.isValid()) saved.collider.setCollisionGroups(saved.previous);
      group.colliders.delete(handle);
    }
    if (owner === undefined) vehicleGroups.delete(station);
  }
  const driveDirection = new Vector3();
  const steerForward = new Vector3();
  const breakMonitor = new BreakMonitor();
  const steerLocal = new Vector3();
  const steerInvRoot = new Quaternion();
  const driveRotation = new Quaternion();
  const upVector = new Vector3();
  const targetUp = new Vector3();

  /** Aplica un impulso en el centro de masa del conjunto para no generar vuelcos por piezas descentradas. */
  function applyImpulseAtCenterOfMass(
    bodies: RapierRigidBody[],
    root: RapierRigidBody,
    impulse: { x: number; y: number; z: number },
  ) {
    // Cada pieza recibe su parte del impulso según su masa (misma aceleración para todas):
    // así no se cargan las uniones ni se genera par por piezas descentradas.
    let mass = 0;
    for (const body of bodies) if (body.isValid()) mass += body.mass();
    if (mass <= 0) {
      root.applyImpulse(impulse, true);
      return;
    }
    for (const body of bodies) {
      if (!body.isValid()) continue;
      const share = body.mass() / mass;
      body.applyImpulse({ x: impulse.x * share, y: impulse.y * share, z: impulse.z * share }, true);
    }
  }

  /**
   * Gira el conjunto entero como sólido rígido: lleva el giro del chasis a `nextYaw` y suma a cada pieza
   * la velocidad que le corresponde por su posición. Si solo se tocara el chasis, las ruedas quedarían con
   * su velocidad vieja y las uniones se estirarían hasta despegarlas.
   */
  function yawAssembly(bodies: RapierRigidBody[], root: RapierRigidBody, nextYaw: number, turnAngle: number) {
    const dOmega = nextYaw - root.angvel().y;
    const c = root.translation();
    const cosA = Math.cos(turnAngle);
    const sinA = Math.sin(turnAngle);
    for (const b of bodies) {
      if (!b.isValid()) continue;
      const w = b.angvel();
      const v = b.linvel();
      const t = b.translation();
      b.setAngvel({ x: w.x, y: w.y + dOmega, z: w.z }, true);
      const vx = v.x + dOmega * (t.z - c.z);
      const vz = v.z - dOmega * (t.x - c.x);
      if (Math.hypot(vx, vz) > 0.35 && turnAngle !== 0) {
        b.setLinvel({ x: vx * cosA + vz * sinA, y: v.y, z: -vx * sinA + vz * cosA }, true);
      } else {
        b.setLinvel({ x: vx, y: v.y, z: vz }, true);
      }
    }
  }

  function assemblyBodies(station: WorkshopStation, root: RapierRigidBody): RapierRigidBody[] {
    const bodies = [root];
    for (const mount of mounts.values()) {
      if (mount.slot.station !== station) continue;
      if (mount.body.isValid()) bodies.push(mount.body);
      if (mount.axleMount?.isValid()) bodies.push(mount.axleMount);
      if (mount.knuckle?.isValid()) bodies.push(mount.knuckle);
    }
    return bodies;
  }

  /** Centro de masa del conjunto (mundo). */
  function centerOfMass(bodies: RapierRigidBody[]) {
    let m = 0; let x = 0; let y = 0; let z = 0;
    for (const b of bodies) {
      if (!b.isValid()) continue;
      const bm = b.mass(); const t = b.translation();
      x += t.x * bm; y += t.y * bm; z += t.z * bm; m += bm;
    }
    return m > 0 ? { x: x / m, y: y / m, z: z / m } : { ...bodies[0].translation() };
  }

  /** Ancho de apoyo (a la altura del centro de masa) de cada estación, medido al doblar. */
  const supportWidths = new Map<WorkshopStation, number>();

  function measureSupport(station: WorkshopStation, root: RapierRigidBody, bodies: RapierRigidBody[]) {
    const com = centerOfMass(bodies);
    const inv = steerInvRoot.copy(root.rotation()).invert();
    const points: { x: number; z: number }[] = [];
    for (const record of mounts.values()) {
      if (record.slot.station !== station || record.slot.type !== 'wheel' || !record.body.isValid()) continue;
      const t = record.body.translation();
      const l = steerLocal.set(t.x - com.x, t.y - com.y, t.z - com.z).applyQuaternion(inv);
      points.push({ x: l.x, z: l.z });
    }
    const width = points.length >= 2 ? supportWidthAtCenter(points) : STEER_REFERENCE_TRACK;
    supportWidths.set(station, width);
    return { com, width };
  }

  /** Estado tierra/aire de los vehículos con ruedas y propulsión de vuelo (con histéresis). */
  const airModes = new Map<WorkshopStation, { flying: boolean; airTime: number }>();

  function wheelsTouchGround(station: WorkshopStation, bodies: RapierRigidBody[]) {
    const own = new Set(bodies.filter((b) => b.isValid()).map((b) => b.handle));
    for (const record of mounts.values()) {
      if (record.slot.station !== station || record.slot.type !== 'wheel' || !record.body.isValid()) continue;
      const t = record.body.translation();
      const ray = new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(
        ray, WHEEL_RADIUS + GROUND_PROBE, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined, undefined, undefined, (collider) => {
          const parent = collider.parent();
          return !parent || !own.has(parent.handle);
        },
      );
      if (hit) return true;
    }
    return false;
  }

  /**
   * Regla única tierra ↔ aire: sin ruedas siempre manda el control de vuelo; con ruedas manda el de
   * vuelo solo si hay propulsión de vuelo y el conjunto está despegado (o se pide subir). Al volver a
   * apoyar las ruedas sin pedir subir, vuelven a mandar las ruedas.
   */
  function updateAirMode(station: WorkshopStation, assembly: WorkshopAssembly, bodies: RapierRigidBody[], ascend: boolean, dt: number) {
    if (!assembly.hasWheels(station)) { airModes.delete(station); return true; }
    if (!assembly.hasFlightPropulsion(station)) { airModes.delete(station); return false; }
    const state = airModes.get(station) ?? { flying: false, airTime: 0 };
    const grounded = wheelsTouchGround(station, bodies);
    state.airTime = grounded ? 0 : state.airTime + dt;
    if (state.flying) {
      if (grounded && !ascend) state.flying = false;
    } else if (ascend || state.airTime > AIR_ENTER_DELAY) {
      state.flying = true;
    }
    airModes.set(station, state);
    return state.flying;
  }

  function flightControlled(station: WorkshopStation, assembly?: WorkshopAssembly) {
    if (!assembly) return false;
    if (!assembly.hasWheels(station)) return true;
    return airModes.get(station)?.flying ?? false;
  }

  function unparkPart(body: RapierRigidBody) {
    if (!parkedParts.delete(body) || !body.isValid()) return;
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.recomputeMassPropertiesFromColliders();
  }

  function stopBench() {
    if (!bench) return;
    for (const id of bench.rotors) {
      const body = mounts.get(id)?.body;
      if (!body?.isValid()) continue;
      body.setLinvel(CENTER, true);
      body.setAngvel(CENTER, true);
      body.setBodyType(rapier.RigidBodyType.Fixed, true);
      parkedParts.add(body);
    }
    bench = null;
  }

  function updateMotors(assembly: WorkshopAssembly, driver?: { station: WorkshopStation; throttle: number }, testPower?: number) {
    if (bench && (testPower === undefined || !bench.root.isValid() || !bench.root.isFixed())) stopBench();
    let active = false;
    for (const [partId, mount] of mounts) {
      const { slot, joint, body } = mount;
      if (!(joint instanceof rapier.RevoluteImpulseJoint) || !joint.isValid()) continue;
      const engine = assembly.engineIdFor(slot);
      const wired = engine ? engineSignal?.(engine) : undefined;
      const rawThrottle = driver?.station === slot.station ? driver.throttle : undefined;
      // Zona muerta: un acelerador casi nulo (joystick/gatillo sin soltar del todo) no debe mover el motor.
      const driverThrottle = rawThrottle === undefined ? undefined : Math.abs(rawThrottle) < 0.05 ? 0 : rawThrottle;
      const autoPowered = assembly.hasBattery(slot.station, batteryUsable);
      const engineDirection = engine ? motorDirection?.(engine) ?? 1 : 1;
      // Si el conductor está sentado: usa su acelerador (o marcha mínima si hay señal cableada activa)
      const testThrottle = bench?.rotors.has(partId) ? testPower : undefined;
      const factor = testThrottle !== undefined ? testThrottle * engineDirection : driverThrottle !== undefined
        ? (wired === 0 && !autoPowered ? 0 : driverThrottle * engineDirection)
        // Con asiento montado y sin conductor ni señal cableada, las ruedas no arrancan solas.
        : (wired ?? (assembly.hasSeat(slot.station) ? 0 : engineDirection));
      const axleDirection = slot.type === 'wheel' ? motorDirection?.(partId) ?? 1 : 1;
      const speed = engine && !parkedParts.has(body) ? SPIN_SPEED * factor * axleDirection * engineConditionFactor(engine) : 0;
      if (speed !== 0) active = true;
      const shouldBrake = speed === 0 && (driverThrottle !== undefined || testThrottle !== undefined);
      if (speed === mount.speed && shouldBrake === Boolean(mount.braking)) continue;
      mount.speed = speed;
      mount.braking = shouldBrake;
      if (speed !== 0) {
        joint.configureMotorVelocity(speed, 2.8);
      } else if (shouldBrake) {
        joint.configureMotorVelocity(0, 4.5);
      } else {
        // Rueda libre: apagamos el motor sin destruir ni recrear la unión (no reinicia el solver de Rapier).
        joint.configureMotor(0, 0, 0, 0);
      }
      body.wakeUp();
    }
    return active;
  }

  return {
    startBench(station: WorkshopStation, root: RapierRigidBody, assembly: WorkshopAssembly) {
      if (!root.isValid() || !root.isFixed() || releasedStations.has(station)) return false;
      const rotors = new Set<string>();
      const motors = new Set<string>();
      for (const [id, { slot, joint, body }] of mounts) {
        if (slot.station !== station || !body.isValid() || !(joint instanceof rapier.RevoluteImpulseJoint) ||
          !joint.isValid()) continue;
        const engine = assembly.engineIdFor(slot);
        if (!engine) continue;
        rotors.add(id);
        motors.add(engine);
      }
      if (!rotors.size) return false;
      stopBench();
      this.parkRestoredAssembly(station, root);
      for (const id of rotors) unparkPart(mounts.get(id)!.body);
      bench = { root, rotors, motors };
      return true;
    },
    benchMotors(): ReadonlySet<string> | null {
      return bench?.motors ?? null;
    },
    benchRpm() {
      let rpm = 0;
      if (!bench) return rpm;
      for (const id of bench.rotors) {
        const mount = mounts.get(id);
        if (!mount?.body.isValid()) continue;
        benchAxis.copy(mount.slot.type === 'wheel' ? WHEEL_SPIN_AXIS : VERTICAL)
          .applyQuaternion(benchRotation.copy(mount.body.rotation()));
        rpm = Math.max(rpm, Math.abs(benchAxis.dot(mount.body.angvel())) * 60 / (2 * Math.PI));
      }
      return Math.round(rpm);
    },
    attach(id: string, slot: WorkshopSlot, body: RapierRigidBody, cartRoot: RapierRigidBody | null = null) {
      const cartMount = slot.station === 'cart' && cartRoot !== null;
      const parent = cartMount ? cartRoot : (anchor ??= world.createRigidBody(rapier.RigidBodyDesc.fixed()));
      const point = cartMount ? new Vector3(...slot.position) : slot.worldPosition;
      if (cartMount) ignoreVehicleContacts(slot.station, cartRoot, body);
      body.setAdditionalSolverIterations(4);
      if (slot.type === 'wheel') setWheelFriction(body, WHEEL_MOUNTED_FRICTION);
      const createJoint = () => {
        const descriptor = slot.axle
          ? rapier.JointData.revolute(point, CENTER, slot.axle)
          : rapier.JointData.fixed(point, slot.mountRotation ?? LEVEL_ROTATION, CENTER, LEVEL_ROTATION);
        const joint = world.createImpulseJoint(descriptor, parent, body, true);
        joint.setContactsEnabled(false);
        return joint;
      };
      breakMonitor.reset(id);
      mounts.set(id, { slot, joint: createJoint(), createJoint, body, speed: 0 });
    },
    attachOnPart(
      id: string,
      mount: WorkshopMount,
      body: RapierRigidBody,
      parentBody: RapierRigidBody,
      worldPosition: { x: number; y: number; z: number },
      worldRotation: { x: number; y: number; z: number; w: number },
      worldAxis?: { x: number; y: number; z: number },
      options: { steer?: boolean } = {},
    ) {
      const parentInvRot = new Quaternion().copy(parentBody.rotation()).invert();
      const parentPos = parentBody.translation();
      const localPoint = new Vector3(
        worldPosition.x - parentPos.x,
        worldPosition.y - parentPos.y,
        worldPosition.z - parentPos.z,
      ).applyQuaternion(parentInvRot);
      const localRot = parentInvRot.clone().multiply(
        new Quaternion(worldRotation.x, worldRotation.y, worldRotation.z, worldRotation.w),
      );
      const localAxis = worldAxis
        ? new Vector3(worldAxis.x, worldAxis.y, worldAxis.z).applyQuaternion(parentInvRot).normalize()
        : undefined;
      const pose = { position: localPoint, rotation: localRot, axis: localAxis };
      const wheelAxis = localAxis?.clone().applyQuaternion(localRot.clone().invert());
      const steer = Boolean(options.steer && mount.type === 'wheel' && localAxis);
      let axleMount: RapierRigidBody | undefined;
      let knuckle: RapierRigidBody | undefined;
      let steerJoint: ImpulseJoint | undefined;
      let knuckleOffset: Vector3 | undefined;
      if (steer && localAxis) {
        // Mangueta: pivote vertical (eje Y de la pieza madre) en el punto de soldadura de la rueda.
        const pivot = new Vector3().copy(steerPivotFor?.(id, mount, pose) ?? steerPivotLocal(localPoint, localAxis));
        knuckleOffset = localPoint.clone().sub(pivot);
        const pivotWorld = pivot.clone().applyQuaternion(parentBody.rotation()).add(parentPos);
        knuckle = world.createRigidBody(rapier.RigidBodyDesc.dynamic()
          .setTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z)
          .setRotation(parentBody.rotation())
          .setAdditionalMassProperties(0.8, CENTER, { x: 0.06, y: 0.06, z: 0.06 }, LEVEL_ROTATION)
          .setAdditionalSolverIterations(4));
        steerJoint = world.createImpulseJoint(
          rapier.JointData.revolute(pivot, CENTER, VERTICAL), parentBody, knuckle, true);
        steerJoint.setContactsEnabled(false);
      }
      if (localAxis && wheelAxis && (steer || localAxis.dot(wheelAxis) < 0.9999)) {
        // Rapier uses the same local axis in both bodies of a revolute joint.
        axleMount = world.createRigidBody(rapier.RigidBodyDesc.dynamic()
          .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
          .setRotation(worldRotation)
          .setAdditionalMassProperties(1, CENTER, { x: 0.08, y: 0.08, z: 0.08 }, LEVEL_ROTATION)
          .setAdditionalSolverIterations(4));
        world.createImpulseJoint(
          knuckle
            ? rapier.JointData.fixed(knuckleOffset!, localRot, CENTER, LEVEL_ROTATION)
            : rapier.JointData.fixed(localPoint, localRot, CENTER, LEVEL_ROTATION),
          knuckle ?? parentBody, axleMount, true);
      }
      ignoreVehicleContacts(mount.station, parentBody, body);
      body.setAdditionalSolverIterations(4);
      parentBody.setAdditionalSolverIterations(4);
      if (mount.type === 'wheel') setWheelFriction(body, WHEEL_MOUNTED_FRICTION);
      const createJoint = () => {
        const descriptor = localAxis
          ? rapier.JointData.revolute(axleMount ? CENTER : pose.position, CENTER, axleMount ? wheelAxis! : localAxis)
          : rapier.JointData.fixed(pose.position, pose.rotation, CENTER, LEVEL_ROTATION);
        const joint = world.createImpulseJoint(descriptor, axleMount ?? parentBody, body, true);
        joint.setContactsEnabled(false);
        return joint;
      };
      const record: MountRecord = {
        slot: mount, joint: createJoint(), createJoint, body, axleMount, speed: 0, localPose: pose,
        parentBody,
      };
      if (knuckle && steerJoint) {
        record.knuckle = knuckle;
        record.steer = { joint: steerJoint, min: -STEER_DEFAULT, max: STEER_DEFAULT, target: 0 };
        const limits = steerLimits?.(id, mount, pose);
        applySteerLimits(record, limits ?? { min: -STEER_DEFAULT, max: STEER_DEFAULT });
      }
      breakMonitor.reset(id);
      mounts.set(id, record);
    },
    getLocalAttachment(id: string) {
      return mounts.get(id)?.localPose;
    },
    isSteerable(id: string) {
      return Boolean(mounts.get(id)?.steer);
    },
    /** Recorrido libre, objetivo y ángulo real de una rueda de dirección. */
    steerInfo(id: string) {
      const record = mounts.get(id);
      if (!record?.steer) return null;
      return { min: record.steer.min, max: record.steer.max, target: record.steer.target, angle: steerAngle(record) };
    },
    /** Vuelve a pedir los topes de dirección (p. ej. después de recortar la pieza madre). */
    refreshSteerLimits(parentId?: string) {
      for (const [id, record] of mounts) {
        if (!record.steer || !record.localPose) continue;
        if (parentId !== undefined && record.slot.parentId !== parentId) continue;
        applySteerLimits(record, steerLimits?.(id, record.slot, record.localPose) ?? { min: -STEER_DEFAULT, max: STEER_DEFAULT });
        record.knuckle?.wakeUp();
      }
    },
    /** Reaplica el grupo de colisión del vehículo a todos los colisionadores actuales de un cuerpo. */
    refreshBodyContacts(body: RapierRigidBody) {
      for (const record of mounts.values()) {
        if (record.body === body && record.parentBody?.isValid()) {
          ignoreVehicleContacts(record.slot.station, record.parentBody, body);
        } else if (record.parentBody === body && record.body.isValid()) {
          ignoreVehicleContacts(record.slot.station, body, record.body);
        }
      }
    },
    /**
     * Gira en el lugar una pieza soldada (sin hijos) alrededor de su centro y la vuelve a soldar.
     * Sirve para reorientar el empuje de una hélice sin desarmar nada.
     */
    canRotateMountedPart(id: string): boolean {
      const record = mounts.get(id);
      if (!record?.parentBody?.isValid() || !record.localPose || record.localPose.axis || record.knuckle) return false;
      return ![...mounts.values()].some((other) => other.parentBody === record.body);
    },
    rotateMountedPart(id: string, worldAxis: { x: number; y: number; z: number }, angle: number): boolean {
      const record = mounts.get(id);
      const parent = record?.parentBody;
      if (!record || !parent?.isValid() || !record.localPose || !this.canRotateMountedPart(id)) return false;
      const parentRot = new Quaternion().copy(parent.rotation());
      const localAxis = new Vector3(worldAxis.x, worldAxis.y, worldAxis.z).applyQuaternion(parentRot.clone().invert()).normalize();
      record.localPose.rotation.premultiply(new Quaternion().setFromAxisAngle(localAxis, angle)).normalize();
      if (record.joint.isValid()) world.removeImpulseJoint(record.joint, true);
      const worldRot = parentRot.multiply(record.localPose.rotation);
      const worldPos = record.localPose.position.clone().applyQuaternion(new Quaternion().copy(parent.rotation())).add(parent.translation());
      record.body.setTranslation(worldPos, true);
      record.body.setRotation(worldRot, true);
      record.body.setLinvel(CENTER, true);
      record.body.setAngvel(CENTER, true);
      record.joint = record.createJoint();
      world.propagateModifiedBodyPositionsToColliders();
      return true;
    },
    detach(id: string) {
      const mount = mounts.get(id);
      if (!mount) return;
      breakMonitor.reset(id);
      if (mount.joint.isValid()) world.removeImpulseJoint(mount.joint, true);
      if (mount.axleMount) {
        parkedParts.delete(mount.axleMount);
        if (mount.axleMount.isValid()) world.removeRigidBody(mount.axleMount);
      }
      if (mount.knuckle) {
        parkedParts.delete(mount.knuckle);
        if (mount.knuckle.isValid()) world.removeRigidBody(mount.knuckle);
      }
      unparkPart(mount.body);
      if (mount.slot.type === 'wheel') setWheelFriction(mount.body, WHEEL_LOOSE_FRICTION);
      mounts.delete(id);
      restoreVehicleContacts(mount.slot.station, mount.body.handle);
      if (![...mounts.values()].some(({ slot }) => slot.station === mount.slot.station)) {
        restoreVehicleContacts(mount.slot.station);
      }
    },
    updateMotors,
    /** Fija (o quita con `null`) el umbral de rotura de la unión de una pieza montada. */
    setBreakLimits(id: string, limits: BreakLimits | null) {
      const mount = mounts.get(id);
      if (!mount) return;
      if (limits && hasBreakLimits(limits)) mount.breakLimits = { ...limits };
      else delete mount.breakLimits;
      breakMonitor.reset(id);
    },
    getBreakLimits(id: string): BreakLimits | null {
      return mounts.get(id)?.breakLimits ?? null;
    },
    /**
     * Junta rompible: mira la carga de cada unión de una estación liberada y devuelve los ids que superaron su
     * umbral (`breakLimits`, o `defaults` por masa si no tienen). Quien llama los suelta y dispara las chispas.
     * Se invoca una vez por paso físico (`dt` en segundos).
     */
    stepBreakage(dt: number, defaults?: { forceMultiple: number; torqueAlpha: number }): string[] {
      const broken: string[] = [];
      for (const [id, mount] of mounts) {
        const body = mount.body;
        if (!body.isValid() || parkedParts.has(body) || !releasedStations.has(mount.slot.station)) {
          breakMonitor.reset(id);
          continue;
        }
        const kin = kinematicsOf(body);
        const limits: BreakLimits | undefined = hasBreakLimits(mount.breakLimits)
          ? mount.breakLimits
          : defaults
            ? {
              breakForce: weightMultiple(kin.mass, defaults.forceMultiple, WORLD_GRAVITY_Y),
              breakTorque: kin.inertia * defaults.torqueAlpha,
            }
            : undefined;
        if (!limits) {
          breakMonitor.reset(id);
          continue;
        }
        if (breakMonitor.update(id, kin, limits, dt, WORLD_GRAVITY_Y)) {
          broken.push(id);
          breakMonitor.reset(id);
        }
      }
      return broken;
    },
    isDrivenWheel(id: string) {
      return (mounts.get(id)?.speed ?? 0) !== 0;
    },
    // Intencionalmente sin fuerzas: la estabilización vertical la hace `stabilizeAndFlyAssembly` (con dt) y
    // la vibración del motor es solo visual (`vehicleFeel.ts` / `WorkshopChassis.tsx`). Se conserva la firma
    // porque la llaman `PlayerRig.tsx` y los tests.
    stepRunning(_cart: RapierRigidBody | null, _elapsed: number) {},
    isReleased(station: WorkshopStation) {
      return releasedStations.has(station);
    },
    isCartReleased() {
      return releasedStations.has('cart');
    },
    /** El conjunto lo gobierna el control de vuelo (sin ruedas, o con ruedas y despegado). */
    usesFlightControl(station: WorkshopStation, assembly: WorkshopAssembly) {
      return flightControlled(station, assembly);
    },
    /** Centro de masa actual de una estación (mundo), para decidir qué ruedas dirigen. */
    stationCenterOfMass(station: WorkshopStation, root: RapierRigidBody) {
      return centerOfMass(assemblyBodies(station, root));
    },
    steerAssembly(
      station: WorkshopStation,
      root: RapierRigidBody | null,
      steer: number,
      dt: number,
      facingBody?: RapierRigidBody | null,
      assembly?: WorkshopAssembly,
    ) {
      if (!releasedStations.has(station) || !root?.isValid()) return;
      const bodies = assemblyBodies(station, root);
      const totalMass = Math.max(bodies.reduce((sum, b) => sum + (b.isValid() ? b.mass() : 0), 0), 1);
      const av = root.angvel();
      const headingBody = isCustomStation(station) && facingBody?.isValid() ? facingBody : root;
      const fwd = driveDirection.set(0, 0, 1).applyQuaternion(driveRotation.copy(headingBody.rotation()));
      fwd.y = 0;
      const vel = root.linvel();
      const flying = flightControlled(station, assembly);
      const airborne = root.translation().y > 1.2 || flying;
      let forwardSpeed = 0;
      if (fwd.lengthSq() > 1e-4) {
        fwd.normalize();
        forwardSpeed = vel.x * fwd.x + vel.z * fwd.z;
        // Agarre lateral constante incluso al soltar el acelerador (suave en vuelo)
        const rightX = fwd.z;
        const rightZ = -fwd.x;
        const sideVel = vel.x * rightX + vel.z * rightZ;
        if (Math.abs(sideVel) > 0.02) {
          const gripRate = airborne ? 1.8 : 6.5;
          const grip = -sideVel * totalMass * Math.min(1, dt * gripRate);
          applyImpulseAtCenterOfMass(bodies, root, { x: rightX * grip, y: 0, z: rightZ * grip });
        }
      }
      // En vuelo (sin ruedas, o con ruedas pero despegado) el giro lo gobierna stabilizeAndFlyAssembly;
      // aquí solo se redirige la velocidad.
      if (flying) {
        const horiz = Math.hypot(vel.x, vel.z);
        if (horiz > 0.35 && Math.abs(av.y) > 0.01) {
          const turnAngle = av.y * dt * 0.8;
          const cosA = Math.cos(turnAngle);
          const sinA = Math.sin(turnAngle);
          root.setLinvel({ x: vel.x * cosA + vel.z * sinA, y: vel.y, z: -vel.x * sinA + vel.z * cosA }, true);
        }
        return;
      }
      // Ruedas de dirección reales: el giro sale del ángulo que de verdad alcanzó la mangueta
      // (modelo de bicicleta). Si la chapa le traba el recorrido, la máquina no dobla.
      // Ancho de apoyo real a la altura del centro de masa → aceleración lateral permitida (continua).
      const support = measureSupport(station, root, bodies);
      const lateral = steerLateralLimit(support.width);
      const steerers: MountRecord[] = [];
      const fixedWheels: MountRecord[] = [];
      for (const record of mounts.values()) {
        if (record.slot.station !== station || record.slot.type !== 'wheel' || !record.body.isValid()) continue;
        if (record.steer && record.knuckle?.isValid()) steerers.push(record);
        else fixedWheels.push(record);
      }
      if (steerers.length) {
        const rootRot = driveRotation.copy(root.rotation());
        const rootFwd = steerForward.set(0, 0, 1).applyQuaternion(rootRot);
        rootFwd.y = 0;
        if (rootFwd.lengthSq() < 1e-4) return;
        rootFwd.normalize();
        const driverSign = fwd.lengthSq() > 1e-4 && fwd.dot(rootFwd) < 0 ? -1 : 1;
        const invRoot = steerInvRoot.copy(rootRot).invert();
        // Distancias longitudinales medidas desde el centro de masa real del conjunto.
        const com = support.com;
        const localZ = (body: RapierRigidBody) => {
          const t = body.translation();
          return steerLocal.set(t.x - com.x, t.y - com.y, t.z - com.z).applyQuaternion(invRoot).z;
        };
        let angle = 0;
        let steerZ = 0;
        for (const record of steerers) {
          const steerState = record.steer!;
          const target = Math.max(steerState.min, Math.min(steerState.max, -steer * STEER_DEFAULT * driverSign));
          if (Math.abs(target - steerState.target) > 1e-3) {
            steerState.target = target;
            (steerState.joint as InstanceType<typeof rapier.RevoluteImpulseJoint>)
              .configureMotorPosition(target, STEER_STIFFNESS, STEER_DAMPING);
            record.knuckle!.wakeUp();
          }
          angle += steerAngle(record);
          steerZ += localZ(record.knuckle!);
        }
        angle /= steerers.length;
        steerZ /= steerers.length;
        let rearZ = 0;
        for (const record of fixedWheels) rearZ += localZ(record.body);
        rearZ = fixedWheels.length ? rearZ / fixedWheels.length : 0;
        let wheelbase = steerZ - rearZ;
        if (Math.abs(wheelbase) < 0.3) wheelbase = wheelbase < 0 ? -0.3 : 0.3;
        const along = vel.x * rootFwd.x + vel.z * rootFwd.z;
        const yawLimit = Math.min(3, lateral / Math.max(0.5, Math.abs(along)));
        const yawRate = Math.max(-yawLimit, Math.min(yawLimit, along * Math.tan(angle) / wheelbase));
        const nextYaw = av.y + (yawRate - av.y) * Math.min(1, dt * 14);
        yawAssembly(bodies, root, nextYaw, Math.hypot(vel.x, vel.z) > 0.35 ? nextYaw * dt * 0.85 : 0);
        return;
      }
      if (Math.abs(steer) < 0.05) {
        if (Math.abs(av.y) > 0.01) {
          root.setAngvel({ x: av.x * 0.92, y: av.y * Math.max(0, 1 - dt * (airborne ? 4.5 : 8)), z: av.z * 0.92 }, true);
        }
        return;
      }
      // Seguridad: volcado o casi volcado → no empujar más el giro (evita trompos y vuelcos).
      if (upVector.set(0, 1, 0).applyQuaternion(driveRotation.copy(root.rotation())).y < 0.6) return;
      const effectiveSteer = forwardSpeed < -0.5 && !airborne ? -steer : steer;
      // El giro máximo baja con la velocidad (aceleración lateral acotada): a 13 m/s ya no hace trompos.
      const speedYawCap = Math.max(1.5, (lateral * 2) / Math.max(3, Math.abs(forwardSpeed)));
      const targetYaw = -effectiveSteer * Math.min(airborne ? 2.4 : 2.85, speedYawCap);
      const nextY = av.y + (targetYaw - av.y) * Math.min(1, dt * (airborne ? 10 : 14));
      root.setAngvel({ x: av.x * 0.88, y: av.y, z: av.z * 0.88 }, true);
      // Giro + redirección de velocidad aplicados a todo el conjunto (no solo al chasis) para no despegar ruedas.
      const horizSpeed = Math.hypot(vel.x, vel.z);
      yawAssembly(bodies, root, nextY, horizSpeed > 0.35 ? nextY * dt * (airborne ? 0.45 : 0.85) : 0);
    },
    driveAssembly(
      station: WorkshopStation,
      root: RapierRigidBody | null,
      throttle: number,
      dt: number,
      assembly?: WorkshopAssembly,
      facingBody?: RapierRigidBody | null,
    ) {
      if (!releasedStations.has(station) || !root?.isValid() || Math.abs(throttle) < 0.05) return;
      // Despegado con propulsión de vuelo: las ruedas no empujan, manda el control de vuelo.
      if (flightControlled(station, assembly)) return;
      if (upVector.set(0, 1, 0).applyQuaternion(driveRotation.copy(root.rotation())).y < 0.42) return;
      const engine = assembly?.engineOnStation(station);
      if (assembly && engine && engineSignal?.(engine) === 0 && !assembly.hasBattery(station)) return;
      const bodies = assemblyBodies(station, root);
      const totalMass = Math.max(bodies.reduce((sum, b) => sum + (b.isValid() ? b.mass() : 0), 0), 1);
      const headingBody = isCustomStation(station) && facingBody?.isValid() ? facingBody : root;
      const fwd = driveDirection.set(0, 0, 1).applyQuaternion(driveRotation.copy(headingBody.rotation()));
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-4) {
        fwd.normalize();
        const direction = engine ? motorDirection?.(engine) ?? 1 : 1;
        const vel = root.linvel();
        const forwardSpeed = vel.x * fwd.x + vel.z * fwd.z;
        const signedTarget = throttle * direction;
        if (Math.abs(forwardSpeed) < 13 || forwardSpeed * signedTarget < 0) {
          const impulse = {
            x: fwd.x * signedTarget * totalMass * 9.5 * dt,
            y: 0,
            z: fwd.z * signedTarget * totalMass * 9.5 * dt,
          };
          applyImpulseAtCenterOfMass(bodies, root, impulse);
        }
      }
    },
    stabilizeAndFlyAssembly(
      station: WorkshopStation,
      root: RapierRigidBody | null,
      input: { throttle: number; steer: number; ascend: boolean; descend: boolean },
      dt: number,
      assembly: WorkshopAssembly,
      facingBody?: RapierRigidBody | null,
    ) {
      if (!releasedStations.has(station) || !root?.isValid() || dt <= 0) return;
      const hasGyro = assembly.hasGyro(station);
      const hasFlight = assembly.hasFlightPropulsion(station);
      const hasWheels = assembly.hasWheels(station);
      if (!hasGyro && !hasFlight && !hasWheels) return;

      const bodies = assemblyBodies(station, root);
      const totalMass = Math.max(bodies.reduce((sum, b) => sum + (b.isValid() ? b.mass() : 0), 0), 1);
      const pos = root.translation();
      const lv = root.linvel();
      const av = root.angvel();
      const headingBody = facingBody?.isValid() ? facingBody : root;
      const fwd = driveDirection.set(0, 0, 1).applyQuaternion(driveRotation.copy(headingBody.rotation()));
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-4) fwd.normalize();
      else fwd.set(0, 0, 1);

      // Regla única tierra ↔ aire (vale igual para un barril, un helicóptero con ruedas o un auto-avión).
      const flightMode = updateAirMode(station, assembly, bodies, input.ascend, dt);
      if (flightMode) {
        // Vuelo (barril, robot, silla, o un vehículo con ruedas despegado): controlador unificado de cuerpo rígido.
        // Aplica rotación objetivo + velocidad lineal distribuida por igual a todas las piezas para evitar tironeos.
        flightClock += dt;
        const steerInput = Math.max(-1, Math.min(1, input.steer));
        const throttleInput = Math.max(-1, Math.min(1, input.throttle));
        const rootRot = driveRotation.copy(root.rotation());
        const rootFwd = driveDirection.set(0, 0, 1).applyQuaternion(rootRot);
        const rootUp = upVector.set(0, 1, 0).applyQuaternion(rootRot);
        const horizFwd = Math.hypot(rootFwd.x, rootFwd.z);
        let heading = flightHeading.get(station);
        const currentYaw = horizFwd > 0.25 ? Math.atan2(rootFwd.x, rootFwd.z) : (heading?.yaw ?? 0);
        if (!heading || flightClock - heading.at > 0.4) heading = { yaw: currentYaw, at: flightClock };
        heading.yaw -= steerInput * 2.1 * dt;
        heading.at = flightClock;
        // Solo alinear rumbo objetivo al rumbo físico cuando la nave está razonablemente derecha;
        // tras un choque inclinado evitamos que un yaw corrupto arrastre el rumbo.
        if (rootUp.y > 0.55 && horizFwd > 0.35) {
          const maxLead = Math.abs(steerInput) < 0.05 ? 0.28 : 0.65;
          const lead = Math.atan2(Math.sin(heading.yaw - currentYaw), Math.cos(heading.yaw - currentYaw));
          heading.yaw = currentYaw + Math.max(-maxLead, Math.min(maxLead, lead));
        }
        flightHeading.set(station, heading);

        const airborneNow = pos.y > 0.95 || input.ascend || (hasWheels && (airModes.get(station)?.airTime ?? 0) > 0.1);
        const pitch = airborneNow ? throttleInput * 0.13 : 0;
        const bank = airborneNow ? steerInput * 0.18 : 0;
        flightTargetQuat.setFromEuler(flightEuler.set(pitch, heading.yaw, bank, 'YXZ'));
        flightErrQuat.copy(rootRot).invert();
        flightErrQuat.premultiply(flightTargetQuat);
        const sign = flightErrQuat.w < 0 ? -1 : 1;
        // En tierra usamos ganancia suave para no clavar el borde del barril/chasis contra el suelo y evitar vibración.
        const gain = airborneNow ? (hasGyro ? 12 : 7.5) : (hasGyro ? 6 : 4);
        let wx = 2 * flightErrQuat.x * sign * gain;
        let wy = 2 * flightErrQuat.y * sign * gain;
        let wz = 2 * flightErrQuat.z * sign * gain;
        const maxAngCmd = airborneNow ? 5.5 : 3.2;
        const mag = Math.hypot(wx, wy, wz);
        if (mag > maxAngCmd) { wx *= maxAngCmd / mag; wy *= maxAngCmd / mag; wz *= maxAngCmd / mag; }

        let cx = 0, cy = 0, cz = 0, mAll = 0, vx = 0, vy = 0, vz = 0;
        let avgWx = 0, avgWy = 0, avgWz = 0;
        for (const b of bodies) {
          if (!b.isValid()) continue;
          const m = b.mass(); const t = b.translation(); const v = b.linvel(); const w = b.angvel();
          cx += t.x * m; cy += t.y * m; cz += t.z * m;
          vx += v.x * m; vy += v.y * m; vz += v.z * m;
          avgWx += w.x * m; avgWy += w.y * m; avgWz += w.z * m;
          mAll += m;
        }
        if (mAll > 0) {
          cx /= mAll; cy /= mAll; cz /= mAll;
          vx /= mAll; vy /= mAll; vz /= mAll;
          // Promedio ponderado por masa y acotado para NO amplificar picos de choque de una pieza liviana.
          const clampW = (val: number) => Math.max(-4.5, Math.min(4.5, val / mAll));
          const curWx = clampW(avgWx);
          const curWy = clampW(avgWy);
          const curWz = clampW(avgWz);
          const kAng = 1 - Math.exp(-(airborneNow ? 14 : 10) * dt);
          const nwx = curWx + (wx - curWx) * kAng;
          const nwy = curWy + (wy - curWy) * kAng;
          const nwz = curWz + (wz - curWz) * kAng;

          const fwdX = Math.sin(heading.yaw);
          const fwdZ = Math.cos(heading.yaw);
          const rightX = fwdZ;
          const rightZ = -fwdX;
          const fwdSpeed = vx * fwdX + vz * fwdZ;
          const sideSpeed = vx * rightX + vz * rightZ;

          let dFwd = 0;
          if (Math.abs(throttleInput) > 0.05) {
            const targetFwdSpeed = throttleInput * 12;
            dFwd = (targetFwdSpeed - fwdSpeed) * (1 - Math.exp(-4.2 * dt));
          } else {
            dFwd = -fwdSpeed * (1 - Math.exp(-(airborneNow ? 2.0 : 5.0) * dt));
          }
          const dSide = -sideSpeed * (1 - Math.exp(-(airborneNow ? 4.2 : 6.5) * dt));
          const dvx = fwdX * dFwd + rightX * dSide;
          const dvz = fwdZ * dFwd + rightZ * dSide;

          let dvy = 0;
          if (input.ascend && hasFlight) {
            if (pos.y < 42) {
              const altScale = pos.y > 34 ? (42 - pos.y) / 8 : 1;
              const targetVy = (hasGyro ? 7.5 : 6.5) * altScale;
              const ay = Math.min(34, 18 * altScale + Math.max(0, targetVy - vy) * 4.5);
              dvy = ay * dt;
            }
          } else if (input.descend && hasFlight && pos.y > 0.95) {
            const targetVy = -5.0;
            const ay = Math.max(-14, (targetVy - vy) * 4.0);
            dvy = ay * dt;
          } else if (hasGyro && hasFlight && pos.y > 1.15) {
            // Hover asistido con giroscopio: descenso suave y estable al soltar el botón de subir.
            const targetVy = -0.8;
            const ay = Math.max(0, Math.min(24, 18 + (targetVy - vy) * 3.5));
            dvy = ay * dt;
          }

          let nextVx = vx + dvx;
          let nextVy = Math.max(-10, Math.min(10, vy + dvy));
          let nextVz = vz + dvz;
          // Límite de velocidad horizontal para evitar disparos tras choques
          const horizSpd = Math.hypot(nextVx, nextVz);
          if (horizSpd > 15) {
            nextVx *= 15 / horizSpd;
            nextVz *= 15 / horizSpd;
          }
          // Límite suave de zona de vuelo para no cruzar el borde de respawn (±150m)
          const MAX_BOUNDS = 115;
          if (cx > MAX_BOUNDS && nextVx > 0) nextVx = -Math.min(4, (cx - MAX_BOUNDS) * 0.5);
          else if (cx < -MAX_BOUNDS && nextVx < 0) nextVx = Math.min(4, (-MAX_BOUNDS - cx) * 0.5);
          if (cz > MAX_BOUNDS && nextVz > 0) nextVz = -Math.min(4, (cz - MAX_BOUNDS) * 0.5);
          else if (cz < -MAX_BOUNDS && nextVz < 0) nextVz = Math.min(4, (-MAX_BOUNDS - cz) * 0.5);

          for (const b of bodies) {
            if (!b.isValid()) continue;
            const t = b.translation();
            const rx = t.x - cx, ry = t.y - cy, rz = t.z - cz;
            b.setAngvel({ x: nwx, y: nwy, z: nwz }, true);
            b.setLinvel({
              x: nextVx + nwy * rz - nwz * ry,
              y: nextVy + nwz * rx - nwx * rz,
              z: nextVz + nwx * ry - nwy * rx,
            }, true);
          }
        }
        return;
      }

      // Estabilización vertical para vehículos con ruedas (libre de gimbal lock mediante producto vectorial)
      const localUp = upVector.set(0, 1, 0).applyQuaternion(driveRotation.copy(root.rotation()));
      const desiredUp = targetUp.set(0, 1, 0);
      if (hasGyro && pos.y > 1.0) {
        const pitchTilt = Math.max(-1, Math.min(1, input.throttle)) * 0.15;
        const rollTilt = Math.max(-1, Math.min(1, input.steer)) * 0.12;
        desiredUp.set(
          fwd.x * pitchTilt - fwd.z * rollTilt,
          1,
          fwd.z * pitchTilt + fwd.x * rollTilt,
        ).normalize();
      }
      const tiltUp = localUp.y;
      const torqueAxis = localUp.cross(desiredUp);
      // Boca abajo (cross ≈ 0): rodar alrededor del frente para no quedar trabado dado vuelta.
      if (tiltUp < 0.15 && torqueAxis.lengthSq() < 0.05 && pos.y < 1.5) {
        torqueAxis.set(fwd.x, 0, fwd.z);
      }
      // Cuanto más inclinado, más fuerte el enderezado (rescata vuelcos sin tocar la conducción normal).
      const rescue = 1 + Math.max(0, 0.8 - tiltUp) * 3;
      // Estabilizador de balanceo para vehículos angostos (bici de ruedas en fila, triciclo): más fuerte
      // cuanto más angosto el apoyo y más rápido va, para poder andar en una sola fila sin caerse de costado.
      const supportWidth = supportWidths.get(station) ?? STEER_REFERENCE_TRACK;
      const narrow = Math.max(0, 1 - supportWidth / NARROW_TRACK);
      const rollBoost = 1 + narrow * Math.min(3, 0.6 + Math.hypot(lv.x, lv.z) / 4);
      const kP = (hasGyro ? 14 : 6.5) * rescue * rollBoost;
      const kD = (hasGyro ? 4.2 : 2.4) * Math.sqrt(rollBoost);
      const maxAccel = 40 * rescue * rollBoost;
      const ax = Math.max(-maxAccel, Math.min(maxAccel, torqueAxis.x * kP - av.x * kD));
      const az = Math.max(-maxAccel, Math.min(maxAccel, torqueAxis.z * kP - av.z * kD));
      root.setAngvel({ x: av.x + ax * dt, y: av.y, z: av.z + az * dt }, true);

      // Freno automático: al soltar el acelerador sobre el piso el coche se frena solo (no queda rodando sin fin).
      if (Math.abs(input.throttle) < 0.05 && pos.y < 1.2 && !input.ascend) {
        const hv = Math.hypot(lv.x, lv.z);
        if (hv > 0.2) {
          const k = totalMass * Math.min(1, 1.6 * dt);
          applyImpulseAtCenterOfMass(bodies, root, { x: -lv.x * k, y: 0, z: -lv.z * k });
        }
      }

      // Red de seguridad global: sin valores inválidos, y velocidades acotadas ante choques raros.
      for (const b of bodies) {
        if (!b.isValid()) continue;
        const t = b.translation();
        const v = b.linvel();
        const w = b.angvel();
        if (![t.x, t.y, t.z, v.x, v.y, v.z, w.x, w.y, w.z].every(Number.isFinite)) {
          b.setLinvel(CENTER, true);
          b.setAngvel(CENTER, true);
          continue;
        }
        const vm = Math.hypot(v.x, v.y, v.z);
        if (vm > 30) b.setLinvel({ x: v.x * 30 / vm, y: v.y * 30 / vm, z: v.z * 30 / vm }, true);
        const wm = Math.hypot(w.x, w.y, w.z);
        if (wm > 14 && !(b.mass() < 5 && b !== root)) b.setAngvel({ x: w.x * 14 / wm, y: w.y * 14 / wm, z: w.z * 14 / wm }, true);
      }

      // Ascenso y empuje aéreo (vehículos con ruedas)
      if (input.ascend && hasFlight) {
        if (pos.y < 42 && lv.y < (hasGyro ? 9.5 : 8.5)) {
          const altScale = pos.y > 34 ? (42 - pos.y) / 8 : 1;
          applyImpulseAtCenterOfMass(bodies, root, { x: 0, y: totalMass * (hasGyro ? 31 : 27) * altScale * dt, z: 0 });
        }
        if (Math.abs(input.throttle) > 0.05 && pos.y > 0.9) {
          const horizSpeed = Math.hypot(lv.x, lv.z);
          const fwdSpeed = lv.x * fwd.x + lv.z * fwd.z;
          if (horizSpeed < 15 || fwdSpeed * input.throttle < 0) {
            const push = totalMass * 10.5 * input.throttle * dt;
            applyImpulseAtCenterOfMass(bodies, root, { x: fwd.x * push, y: 0, z: fwd.z * push });
          }
        }
      }

      // Descenso controlado
      if (input.descend && hasFlight && pos.y > 1.05 && lv.y > -5.5) {
        applyImpulseAtCenterOfMass(bodies, root, { x: 0, y: -totalMass * 14 * dt, z: 0 });
      }

      // Amortiguación de planeo con Giroscopio
      if (hasGyro && hasFlight && !input.ascend && !input.descend && pos.y > 1.2 && lv.y < -1.5) {
        const brake = totalMass * Math.min(18, (-lv.y - 1.5) * 3.5) * dt;
        applyImpulseAtCenterOfMass(bodies, root, { x: 0, y: brake, z: 0 });
      }
    },
    fixCustomRoot(root: RapierRigidBody) {
      root.setLinvel(CENTER, true);
      root.setAngvel(CENTER, true);
      root.setBodyType(rapier.RigidBodyType.Fixed, true);
    },
    parkRestoredAssembly(station: WorkshopStation, root: RapierRigidBody) {
      for (const body of assemblyBodies(station, root)) {
        if (body === root || !body.isValid()) continue;
        body.setBodyType(rapier.RigidBodyType.Fixed, true);
        parkedParts.add(body);
      }
    },
    releaseCustomRoot(station: WorkshopStation, root: RapierRigidBody) {
      releasedStations.delete(station);
      flightHeading.delete(station);
      airModes.delete(station);
      root.setLinvel(CENTER, true);
      root.setAngvel(CENTER, true);
      root.setBodyType(rapier.RigidBodyType.Dynamic, true);
      root.wakeUp();
    },
    toggleAssembly(station: WorkshopStation, root: RapierRigidBody, assembly: WorkshopAssembly, withDriver = false) {
      const released = !releasedStations.has(station);
      if (released) releasedStations.add(station);
      else releasedStations.delete(station);
      flightHeading.delete(station);
      airModes.delete(station);
      root.setLinvel(CENTER, true);
      root.setAngvel(CENTER, true);
      root.setBodyType(released ? rapier.RigidBodyType.Dynamic : rapier.RigidBodyType.Fixed, true);
      if (released) root.recomputeMassPropertiesFromColliders();
      for (const b of assemblyBodies(station, root)) {
        if (!b.isValid()) continue;
        if (released) unparkPart(b);
        b.setLinvel(CENTER, true);
        b.setAngvel(CENTER, true);
        b.wakeUp();
      }
      updateMotors(assembly, released && withDriver ? { station, throttle: 0 } : undefined);
    },
    toggleCart(cart: RapierRigidBody, assembly: WorkshopAssembly) {
      this.toggleAssembly('cart', cart, assembly);
    },
    pushAssembly(station: WorkshopStation, root: RapierRigidBody, player: { x: number; z: number }) {
      const at = root.translation();
      const away = new Vector3(at.x - player.x, 0, at.z - player.z);
      if (!releasedStations.has(station) || away.lengthSq() < 0.04) return;
      const velocity = root.linvel();
      if (Math.hypot(velocity.x, velocity.z) >= 2.5) return;
      away.normalize().multiplyScalar(Math.max(root.mass(), 1) * 0.95);
      root.applyImpulse(away, true);
    },
    manualHandling(station: WorkshopStation, root: RapierRigidBody, assembly: WorkshopAssembly) {
      if (!releasedStations.has(station)) return 'release';
      const mass = assemblyBodies(station, root).reduce((total, body) => total + body.mass(), 0);
      if (mass <= MANUAL_LIFT_LIMIT) return 'lift';
      return assembly.hasWheels(station) || mass <= MANUAL_DRAG_LIMIT ? 'push' : 'heavy';
    },
    holdAssembly(station: WorkshopStation, root: RapierRigidBody, assembly: WorkshopAssembly) {
      if (this.manualHandling(station, root, assembly) !== 'lift') return false;
      this.holdAssemblyForEditing(station, root, assembly);
      return true;
    },
    holdAssemblyForEditing(station: WorkshopStation, root: RapierRigidBody, assembly: WorkshopAssembly) {
      if (releasedStations.has(station)) this.toggleAssembly(station, root, assembly);
      this.parkRestoredAssembly(station, root);
    },
    pushByHand(station: WorkshopStation, root: RapierRigidBody, player: { x: number; z: number },
      dt: number, assembly: WorkshopAssembly) {
      if (this.manualHandling(station, root, assembly) !== 'push') return;
      const at = root.translation();
      const dx = at.x - player.x;
      const dz = at.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.2 || distance > 3) return;
      const velocity = root.linvel();
      if (Math.hypot(velocity.x, velocity.z) > 2.1) return;
      const bodies = assemblyBodies(station, root);
      const mass = bodies.reduce((total, body) => total + body.mass(), 0);
      const impulse = (assembly.hasWheels(station) ? 105 : Math.min(720, mass * 20)) * dt;
      applyImpulseAtCenterOfMass(bodies, root, { x: dx * impulse / distance, y: 0, z: dz * impulse / distance });
    },
    pushCart(cart: RapierRigidBody, player: { x: number; z: number }) {
      this.pushAssembly('cart', cart, player);
    },
    rotateAssembly(station: WorkshopStation, root: RapierRigidBody, angle = TURN_STEP, axis = VERTICAL): boolean {
      if (releasedStations.has(station)) return false;
      const bodies = assemblyBodies(station, root);
      const own = new Set(bodies.map((body) => body.handle));
      const pivot = new Vector3().copy(root.translation());
      const yaw = new Quaternion();
      const position = new Vector3();
      const rotation = new Quaternion();
      const steps = Math.max(1, Math.ceil(Math.abs(angle) / (Math.PI / 24) - 1e-8));
      for (let step = 1; step <= steps; step++) {
        yaw.setFromAxisAngle(axis, angle * step / steps);
        for (const body of bodies) {
          for (let index = 0; index < body.numColliders(); index++) {
            const collider = body.collider(index);
            position.copy(collider.translation()).sub(pivot).applyQuaternion(yaw).add(pivot);
            position.y += 0.018;
            rotation.copy(collider.rotation()).premultiply(yaw);
            const obstruction = world.intersectionWithShape(
              position, rotation, collider.shape, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
              undefined, undefined, undefined, (other) => !own.has(other.parent()?.handle ?? -1)
            );
            if (obstruction) return false;
          }
        }
      }
      for (const body of bodies) {
        position.copy(body.translation()).sub(pivot).applyQuaternion(yaw).add(pivot);
        rotation.copy(body.rotation()).premultiply(yaw);
        body.setTranslation(position, true);
        body.setRotation(rotation, true);
        body.setLinvel(CENTER, true);
        body.setAngvel(CENTER, true);
      }
      world.propagateModifiedBodyPositionsToColliders();
      flightHeading.delete(station);
      return true;
    },
    rotateCart(cart: RapierRigidBody, angle = TURN_STEP): boolean {
      return this.rotateAssembly('cart', cart, angle);
    },
    moveAssembly(station: WorkshopStation, root: RapierRigidBody, delta: { x: number; y: number; z: number }): boolean {
      if (releasedStations.has(station)) return false;
      const bodies = assemblyBodies(station, root);
      const own = new Set(bodies.map((body) => body.handle));
      const position = new Vector3();
      for (const body of bodies) {
        for (let index = 0; index < body.numColliders(); index++) {
          const collider = body.collider(index);
          position.copy(collider.translation()).add(delta);
          const obstruction = world.intersectionWithShape(
            position, collider.rotation(), collider.shape, rapier.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined, undefined, undefined, (other) => !own.has(other.parent()?.handle ?? -1)
          );
          if (obstruction) return false;
        }
      }
      for (const body of bodies) {
        const at = body.translation();
        body.setTranslation({ x: at.x + delta.x, y: at.y + delta.y, z: at.z + delta.z }, true);
        body.setLinvel(CENTER, true);
        body.setAngvel(CENTER, true);
      }
      world.propagateModifiedBodyPositionsToColliders();
      flightHeading.delete(station);
      return true;
    },
    reset(cart?: RapierRigidBody | null) {
      stopBench();
      breakMonitor.clear();
      for (const { joint, axleMount, knuckle, slot, body } of mounts.values()) {
        if (joint.isValid()) world.removeImpulseJoint(joint, true);
        if (axleMount?.isValid()) world.removeRigidBody(axleMount);
        if (knuckle?.isValid()) world.removeRigidBody(knuckle);
        if (slot.type === 'wheel') setWheelFriction(body, WHEEL_LOOSE_FRICTION);
        unparkPart(body);
      }
      for (const station of vehicleGroups.keys()) restoreVehicleContacts(station);
      if (anchor?.isValid()) world.removeRigidBody(anchor);
      mounts.clear();
      parkedParts.clear();
      anchor = null;
      releasedStations.clear();
      flightHeading.clear();
      if (!cart?.isValid()) return;
      cart.setBodyType(rapier.RigidBodyType.Fixed, true);
      cart.setRotation(LEVEL_ROTATION, true);
      cart.setLinvel(CENTER, true);
      cart.setAngvel(CENTER, true);
    },
  };
}
