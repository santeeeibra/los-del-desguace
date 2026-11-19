import type { RapierCollider, RapierRigidBody, useRapier } from '@react-three/rapier';
import { Euler, Quaternion, Vector3 } from 'three';
import type { WorkshopAssembly, WorkshopMount, WorkshopSlot, WorkshopStation } from './workshopAssembly';
import { isCustomStation } from './workshopAssembly';

type PhysicsContext = ReturnType<typeof useRapier>;
type ImpulseJoint = ReturnType<PhysicsContext['world']['createImpulseJoint']>;

const CENTER = { x: 0, y: 0, z: 0 };
export const LEVEL_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const SPIN_SPEED = 10;
const VERTICAL = new Vector3(0, 1, 0);
const TURN_STEP = Math.PI / 4;
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
) {
  let anchor: RapierRigidBody | null = null;
  const mounts = new Map<string, {
    slot: WorkshopMount;
    joint: ImpulseJoint;
    createJoint: () => ImpulseJoint;
    body: RapierRigidBody;
    axleMount?: RapierRigidBody;
    speed: number;
    braking?: boolean;
    localPose?: { position: Vector3; rotation: Quaternion; axis?: Vector3 };
  }>();
  const releasedStations = new Set<WorkshopStation>();
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

  function assemblyBodies(station: WorkshopStation, root: RapierRigidBody): RapierRigidBody[] {
    const bodies = [root];
    for (const mount of mounts.values()) {
      if (mount.slot.station !== station) continue;
      if (mount.body.isValid()) bodies.push(mount.body);
      if (mount.axleMount?.isValid()) bodies.push(mount.axleMount);
    }
    return bodies;
  }

  function updateMotors(assembly: WorkshopAssembly, driver?: { station: WorkshopStation; throttle: number }) {
    let active = false;
    for (const [partId, mount] of mounts) {
      const { slot, joint, body } = mount;
      if (!(joint instanceof rapier.RevoluteImpulseJoint) || !joint.isValid()) continue;
      const engine = assembly.engineIdFor(slot);
      const wired = engine ? engineSignal?.(engine) : undefined;
      const driverThrottle = driver?.station === slot.station ? driver.throttle : undefined;
      const autoPowered = assembly.hasBattery(slot.station);
      const engineDirection = engine ? motorDirection?.(engine) ?? 1 : 1;
      // Si el conductor está sentado: usa su acelerador (o marcha mínima si hay señal cableada activa)
      const factor = driverThrottle !== undefined
        ? (wired === 0 && !autoPowered ? 0 : driverThrottle * engineDirection)
        : (wired ?? engineDirection);
      const axleDirection = slot.type === 'wheel' ? motorDirection?.(partId) ?? 1 : 1;
      const speed = engine ? SPIN_SPEED * factor * axleDirection : 0;
      if (speed !== 0) active = true;
      const shouldBrake = speed === 0 && driverThrottle !== undefined;
      if (speed === mount.speed && shouldBrake === Boolean(mount.braking)) continue;
      mount.speed = speed;
      mount.braking = shouldBrake;
      if (speed !== 0) {
        joint.configureMotorVelocity(speed, 7.5);
      } else if (shouldBrake) {
        joint.configureMotorVelocity(0, 14.0);
      } else {
        // Rapier keeps an enabled motor constraint even with a zero velocity factor.
        world.removeImpulseJoint(joint, true);
        mount.joint = mount.createJoint();
      }
      body.wakeUp();
    }
    return active;
  }

  return {
    attach(id: string, slot: WorkshopSlot, body: RapierRigidBody, cartRoot: RapierRigidBody | null = null) {
      const cartMount = slot.station === 'cart' && cartRoot !== null;
      const parent = cartMount ? cartRoot : (anchor ??= world.createRigidBody(rapier.RigidBodyDesc.fixed()));
      const point = cartMount ? new Vector3(...slot.position) : slot.worldPosition;
      if (cartMount) ignoreVehicleContacts(slot.station, cartRoot, body);
      if (slot.type === 'wheel') setWheelFriction(body, WHEEL_MOUNTED_FRICTION);
      const createJoint = () => {
        const descriptor = slot.axle
          ? rapier.JointData.revolute(point, CENTER, slot.axle)
          : rapier.JointData.fixed(point, slot.mountRotation ?? LEVEL_ROTATION, CENTER, LEVEL_ROTATION);
        const joint = world.createImpulseJoint(descriptor, parent, body, true);
        joint.setContactsEnabled(false);
        return joint;
      };
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
      const wheelAxis = localAxis?.clone().applyQuaternion(localRot.clone().invert());
      let axleMount: RapierRigidBody | undefined;
      if (localAxis && wheelAxis && localAxis.dot(wheelAxis) < 0.9999) {
        // Rapier uses the same local axis in both bodies of a revolute joint.
        axleMount = world.createRigidBody(rapier.RigidBodyDesc.dynamic()
          .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
          .setRotation(worldRotation)
          .setAdditionalMassProperties(1, CENTER, { x: 0.08, y: 0.08, z: 0.08 }, LEVEL_ROTATION)
          .setAdditionalSolverIterations(4));
        world.createImpulseJoint(
          rapier.JointData.fixed(localPoint, localRot, CENTER, LEVEL_ROTATION), parentBody, axleMount, true);
      }
      ignoreVehicleContacts(mount.station, parentBody, body);
      if (mount.type === 'wheel') setWheelFriction(body, WHEEL_MOUNTED_FRICTION);
      const createJoint = () => {
        const descriptor = localAxis
          ? rapier.JointData.revolute(axleMount ? CENTER : localPoint, CENTER, axleMount ? wheelAxis! : localAxis)
          : rapier.JointData.fixed(localPoint, localRot, CENTER, LEVEL_ROTATION);
        const joint = world.createImpulseJoint(descriptor, axleMount ?? parentBody, body, true);
        joint.setContactsEnabled(false);
        return joint;
      };
      mounts.set(id, {
        slot: mount, joint: createJoint(), createJoint, body, axleMount, speed: 0,
        localPose: { position: localPoint, rotation: localRot, axis: localAxis },
      });
    },
    getLocalAttachment(id: string) {
      return mounts.get(id)?.localPose;
    },
    detach(id: string) {
      const mount = mounts.get(id);
      if (!mount) return;
      if (mount.joint.isValid()) world.removeImpulseJoint(mount.joint, true);
      if (mount.axleMount?.isValid()) world.removeRigidBody(mount.axleMount);
      if (mount.slot.type === 'wheel') setWheelFriction(mount.body, WHEEL_LOOSE_FRICTION);
      mounts.delete(id);
      restoreVehicleContacts(mount.slot.station, mount.body.handle);
      if (![...mounts.values()].some(({ slot }) => slot.station === mount.slot.station)) {
        restoreVehicleContacts(mount.slot.station);
      }
    },
    updateMotors,
    isDrivenWheel(id: string) {
      return (mounts.get(id)?.speed ?? 0) !== 0;
    },
    stepRunning(cart: RapierRigidBody | null, elapsed: number) {
      if (!releasedStations.has('cart') || !cart?.isValid()) return;
      let poweredAxle = false;
      for (const mount of mounts.values()) {
        if (mount.slot.station === 'cart' && mount.speed !== 0) {
          poweredAxle = true;
          break;
        }
      }
      if (!poweredAxle) return;
      // Estabilizador giroscópico suave (reduce el cabeceo "sube y baja" con 2 ruedas y en vuelo)
      const r = cart.rotation();
      const pitchErr = 2 * (r.w * r.x - r.y * r.z);
      const rollErr = 2 * (r.w * r.z + r.x * r.y);
      const mass = cart.mass();
      const angVel = cart.angvel();
      cart.applyTorqueImpulse(
        {
          x: (-pitchErr * 1.4 - angVel.x * 0.35) * mass * 0.04,
          y: 0,
          z: (-rollErr * 1.4 - angVel.z * 0.35) * mass * 0.04,
        },
        true
      );
      const rumble = Math.sin(elapsed * 42) * 0.65 + Math.cos(elapsed * 67) * 0.35;
      cart.applyImpulse({ x: rumble * mass * 0.0003, y: 0, z: 0 }, true);
    },
    isReleased(station: WorkshopStation) {
      return releasedStations.has(station);
    },
    isCartReleased() {
      return releasedStations.has('cart');
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
      const headingBody = facingBody?.isValid() ? facingBody : root;
      const fwd = driveDirection.set(0, 0, 1).applyQuaternion(driveRotation.copy(headingBody.rotation()));
      fwd.y = 0;
      const vel = root.linvel();
      const airborne = root.translation().y > 1.2 || (assembly ? !assembly.hasWheels(station) : false);
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
          const grip = -sideVel * root.mass() * Math.min(1, dt * gripRate);
          root.applyImpulse({ x: rightX * grip, y: 0, z: rightZ * grip }, true);
        }
      }
      // En vuelo libre (sin ruedas) el giro lo gobierna stabilizeAndFlyAssembly; aquí solo se redirige la velocidad.
      const freeFlyer = assembly ? !assembly.hasWheels(station) : false;
      if (freeFlyer) {
        const horiz = Math.hypot(vel.x, vel.z);
        if (horiz > 0.35 && Math.abs(av.y) > 0.01) {
          const turnAngle = av.y * dt * 0.8;
          const cosA = Math.cos(turnAngle);
          const sinA = Math.sin(turnAngle);
          root.setLinvel({ x: vel.x * cosA + vel.z * sinA, y: vel.y, z: -vel.x * sinA + vel.z * cosA }, true);
        }
        return;
      }
      if (Math.abs(steer) < 0.05) {
        if (Math.abs(av.y) > 0.01) {
          root.setAngvel({ x: av.x * 0.92, y: av.y * Math.max(0, 1 - dt * (airborne ? 4.5 : 8)), z: av.z * 0.92 }, true);
        }
        return;
      }
      const effectiveSteer = forwardSpeed < -0.5 && !airborne ? -steer : steer;
      const targetYaw = -effectiveSteer * (airborne ? 2.4 : 2.85);
      const nextY = av.y + (targetYaw - av.y) * Math.min(1, dt * (airborne ? 10 : 14));
      root.setAngvel({ x: av.x * 0.88, y: nextY, z: av.z * 0.88 }, true);
      root.applyTorqueImpulse({ x: 0, y: -effectiveSteer * totalMass * 2.2 * dt, z: 0 }, true);
      // Redirigir suavemente la velocidad horizontal al girar para trazar curvas ágiles
      const grippedVelocity = root.linvel();
      const horizSpeed = Math.hypot(grippedVelocity.x, grippedVelocity.z);
      if (horizSpeed > 0.35) {
        const turnAngle = nextY * dt * (airborne ? 0.45 : 0.85);
        const cosA = Math.cos(turnAngle);
        const sinA = Math.sin(turnAngle);
        root.setLinvel(
          {
            x: grippedVelocity.x * cosA + grippedVelocity.z * sinA,
            y: grippedVelocity.y,
            z: -grippedVelocity.x * sinA + grippedVelocity.z * cosA,
          },
          true,
        );
      }
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
      const engine = assembly?.engineOnStation(station);
      if (assembly && engine && engineSignal?.(engine) === 0 && !assembly.hasBattery(station)) return;
      const bodies = assemblyBodies(station, root);
      const totalMass = Math.max(bodies.reduce((sum, b) => sum + (b.isValid() ? b.mass() : 0), 0), 1);
      const headingBody = facingBody?.isValid() ? facingBody : root;
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
          if (isCustomStation(station)) applyImpulseAtCenterOfMass(bodies, root, impulse);
          else root.applyImpulse(impulse, true);
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
      if (!hasGyro && !hasFlight) return;

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

      if (!assembly.hasWheels(station)) {
        // Vuelo libre (barril, robot, silla...): controlador por orientación objetivo.
        // Rumbo = lo que marca el giro; inclinación = hacia adelante con el acelerador y ladeado al girar.
        flightClock += dt;
        const q = root.rotation();
        const currentYaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
        let heading = flightHeading.get(station);
        if (!heading || flightClock - heading.at > 0.4) heading = { yaw: currentYaw, at: flightClock };
        heading.yaw -= Math.max(-1, Math.min(1, input.steer)) * 1.9 * dt;
        heading.at = flightClock;
        // El rumbo objetivo no puede adelantarse mucho al cuerpo: si no, al cambiar de lado sigue girando al anterior.
        const lead = Math.atan2(Math.sin(heading.yaw - currentYaw), Math.cos(heading.yaw - currentYaw));
        heading.yaw = currentYaw + Math.max(-0.7, Math.min(0.7, lead));
        flightHeading.set(station, heading);
        const airborneNow = pos.y > 1.0;
        const pitch = airborneNow ? Math.max(-1, Math.min(1, input.throttle)) * 0.18 : 0;
        const bank = airborneNow ? Math.max(-1, Math.min(1, input.steer)) * 0.28 : 0;
        flightTargetQuat.setFromEuler(flightEuler.set(pitch, heading.yaw, bank, 'YXZ'));
        flightErrQuat.copy(root.rotation() as unknown as Quaternion).invert();
        flightErrQuat.premultiply(flightTargetQuat);
        const sign = flightErrQuat.w < 0 ? -1 : 1;
        const gain = hasGyro ? 10 : 5;
        let wx = 2 * flightErrQuat.x * sign * gain;
        let wy = 2 * flightErrQuat.y * sign * gain;
        let wz = 2 * flightErrQuat.z * sign * gain;
        const mag = Math.hypot(wx, wy, wz);
        if (mag > 5) { wx *= 5 / mag; wy *= 5 / mag; wz *= 5 / mag; }
        // Se gira el conjunto como un sólido rígido: misma velocidad angular para todas las piezas y la
        // velocidad lineal que corresponde a cada posición. Así las uniones no se estiran ni oscilan.
        const k = Math.min(1, dt * 10);
        const nwx = av.x + (wx - av.x) * k;
        const nwy = av.y + (wy - av.y) * k;
        const nwz = av.z + (wz - av.z) * k;
        let cx = 0, cy = 0, cz = 0, mAll = 0, vx = 0, vy = 0, vz = 0;
        for (const b of bodies) {
          if (!b.isValid()) continue;
          const m = b.mass(); const t = b.translation(); const v = b.linvel();
          cx += t.x * m; cy += t.y * m; cz += t.z * m;
          vx += v.x * m; vy += v.y * m; vz += v.z * m; mAll += m;
        }
        if (mAll > 0) {
          cx /= mAll; cy /= mAll; cz /= mAll; vx /= mAll; vy /= mAll; vz /= mAll;
          for (const b of bodies) {
            if (!b.isValid()) continue;
            const t = b.translation();
            const rx = t.x - cx, ry = t.y - cy, rz = t.z - cz;
            b.setAngvel({ x: nwx, y: nwy, z: nwz }, true);
            b.setLinvel({
              x: vx + nwy * rz - nwz * ry,
              y: vy + nwz * rx - nwx * rz,
              z: vz + nwx * ry - nwy * rx,
            }, true);
          }
        }
      } else {
        // Estabilización vertical (libre de gimbal lock mediante producto vectorial)
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
        const torqueAxis = localUp.cross(desiredUp);
        const kP = hasGyro ? 14 : 6.5;
        const kD = hasGyro ? 4.2 : 2.4;
        // Corrección directa de velocidad angular (aceleración rad/s²): estable sin depender de la inercia del compuesto.
        const maxAccel = 40;
        const ax = Math.max(-maxAccel, Math.min(maxAccel, torqueAxis.x * kP - av.x * kD));
        const az = Math.max(-maxAccel, Math.min(maxAccel, torqueAxis.z * kP - av.z * kD));
        root.setAngvel({ x: av.x + ax * dt, y: av.y, z: av.z + az * dt }, true);
      }

      // Ascenso y empuje aéreo (solo cuando ascend está activo)
      if (input.ascend && hasFlight) {
        if (pos.y < 42 && lv.y < (hasGyro ? 9.5 : 8.5)) {
          const altScale = pos.y > 34 ? (42 - pos.y) / 8 : 1;
          applyImpulseAtCenterOfMass(bodies, root, { x: 0, y: totalMass * (hasGyro ? 31 : 27) * altScale * dt, z: 0 });
        }
        if (Math.abs(input.throttle) > 0.05 && (pos.y > 0.9 || !assembly.hasWheels(station))) {
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
    releaseCustomRoot(station: WorkshopStation, root: RapierRigidBody) {
      releasedStations.delete(station);
      root.setLinvel(CENTER, true);
      root.setAngvel(CENTER, true);
      root.setBodyType(rapier.RigidBodyType.Dynamic, true);
      root.wakeUp();
    },
    toggleAssembly(station: WorkshopStation, root: RapierRigidBody, assembly: WorkshopAssembly) {
      const released = !releasedStations.has(station);
      if (released) releasedStations.add(station);
      else releasedStations.delete(station);
      root.setLinvel(CENTER, true);
      root.setAngvel(CENTER, true);
      root.setBodyType(released ? rapier.RigidBodyType.Dynamic : rapier.RigidBodyType.Fixed, true);
      updateMotors(assembly);
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
    pushCart(cart: RapierRigidBody, player: { x: number; z: number }) {
      this.pushAssembly('cart', cart, player);
    },
    rotateAssembly(station: WorkshopStation, root: RapierRigidBody, angle = TURN_STEP): boolean {
      if (releasedStations.has(station)) return false;
      const bodies = assemblyBodies(station, root);
      const own = new Set(bodies.map((body) => body.handle));
      const pivot = new Vector3().copy(root.translation());
      const yaw = new Quaternion();
      const position = new Vector3();
      const rotation = new Quaternion();
      const steps = Math.max(1, Math.ceil(Math.abs(angle) / (Math.PI / 24) - 1e-8));
      for (let step = 1; step <= steps; step++) {
        yaw.setFromAxisAngle(VERTICAL, angle * step / steps);
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
      return true;
    },
    reset(cart?: RapierRigidBody | null) {
      for (const { joint, axleMount, slot, body } of mounts.values()) {
        if (joint.isValid()) world.removeImpulseJoint(joint, true);
        if (axleMount?.isValid()) world.removeRigidBody(axleMount);
        if (slot.type === 'wheel') setWheelFriction(body, WHEEL_LOOSE_FRICTION);
      }
      for (const station of vehicleGroups.keys()) restoreVehicleContacts(station);
      if (anchor?.isValid()) world.removeRigidBody(anchor);
      mounts.clear();
      anchor = null;
      releasedStations.clear();
      if (!cart?.isValid()) return;
      cart.setBodyType(rapier.RigidBodyType.Fixed, true);
      cart.setRotation(LEVEL_ROTATION, true);
      cart.setLinvel(CENTER, true);
      cart.setAngvel(CENTER, true);
    },
  };
}
