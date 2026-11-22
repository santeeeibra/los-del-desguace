import type { RapierRigidBody, useRapier } from '@react-three/rapier';
import { Quaternion, Vector3 } from 'three';

/**
 * Módulo de piezas robóticas y mecanismos articulados para Taller El Yunke (Los del Desguace).
 *
 * Habilita brazos robóticos, grúas giratorias, excavadoras, catapultas y rescates
 * combinando 5 bloques físicos sobre Rapier (sin casos especiales por vehículo):
 * - `hinge`: Bisagra motorizada (RevoluteImpulseJoint con límites y posición objetivo).
 * - `piston`: Pistón extensible (PrismaticImpulseJoint con carrera lineal).
 * - `bearing`: Base giratoria 360° (RevoluteImpulseJoint continua por velocidad).
 * - `claw`: Pinza / garra mecánica (junta de agarre temporal mientras tiene señal).
 * - `winch`: Cabrestante / gancho con cable tensado por fuerza resorte-amortiguador.
 */

type PhysicsContext = ReturnType<typeof useRapier>;
type ImpulseJoint = ReturnType<PhysicsContext['world']['createImpulseJoint']>;

export type RoboticPartKind = 'hinge' | 'piston' | 'bearing' | 'claw' | 'winch';

export interface RoboticPartSpec {
  kind: RoboticPartKind;
  label: string;
  size: readonly [number, number, number];
  mass: number;
  breakForce: number;
  isMagnetic: boolean;
  paintable: boolean;
  /** Límites de recorrido: radianes para `hinge`, metros para `piston`. */
  limits?: readonly [number, number];
  /** Velocidad máxima (rad/s para `bearing`, m/s para `winch`). */
  maxSpeed: number;
  /** Rigidez del motor PD (para `hinge` y `piston`). */
  stiffness: number;
  /** Amortiguación del motor PD. */
  damping: number;
  /** Longitud máxima de cable en metros (solo `winch`). */
  maxCableLength?: number;
  /** Fuerza máxima de tracción del cable en Newtons (solo `winch`). */
  maxPullForce?: number;
  /** Radio de captura de la pinza en metros (solo `claw`). */
  gripRadius?: number;
}

export const ROBOTICS_SPECS: Record<RoboticPartKind, RoboticPartSpec> = {
  hinge: {
    kind: 'hinge',
    label: 'Bisagra Motorizada',
    size: [0.36, 0.22, 0.36],
    mass: 0.65,
    breakForce: 1800,
    isMagnetic: true,
    paintable: true,
    limits: [-1.4, 1.4],
    maxSpeed: 2.2,
    stiffness: 950,
    damping: 95,
  },
  piston: {
    kind: 'piston',
    label: 'Pistón Extensible',
    size: [0.28, 0.28, 0.65],
    mass: 0.85,
    breakForce: 2200,
    isMagnetic: true,
    paintable: true,
    limits: [0, 1.35],
    maxSpeed: 2.4,
    stiffness: 1200,
    damping: 110,
  },
  bearing: {
    kind: 'bearing',
    label: 'Base Giratoria 360°',
    size: [0.55, 0.16, 0.55],
    mass: 0.9,
    breakForce: 2400,
    isMagnetic: true,
    paintable: true,
    maxSpeed: 3.6,
    stiffness: 0,
    damping: 12,
  },
  claw: {
    kind: 'claw',
    label: 'Pinza Mecánica',
    size: [0.46, 0.32, 0.48],
    mass: 0.55,
    breakForce: 1500,
    isMagnetic: true,
    paintable: true,
    maxSpeed: 4.0,
    stiffness: 0,
    damping: 0,
    gripRadius: 0.58,
  },
  winch: {
    kind: 'winch',
    label: 'Cabrestante con Soga',
    size: [0.42, 0.34, 0.42],
    mass: 0.95,
    breakForce: 2600,
    isMagnetic: true,
    paintable: true,
    maxSpeed: 3.5,
    stiffness: 90,
    damping: 18,
    maxCableLength: 18,
    maxPullForce: 3200,
  },
};

export function isRoboticPartKind(value: string): value is RoboticPartKind {
  return value in ROBOTICS_SPECS;
}

export interface RoboticJointRecord {
  id: string;
  kind: 'hinge' | 'piston' | 'bearing';
  joint: ImpulseJoint;
  parentBody: RapierRigidBody;
  childBody: RapierRigidBody;
  /** Posición o velocidad objetivo actual (rad, m o rad/s). */
  target: number;
}

export interface ClawGripState {
  clawBody: RapierRigidBody;
  grabbedBody: RapierRigidBody | null;
  gripJoint: ImpulseJoint | null;
  closed: boolean;
}

export interface WinchState {
  winchBody: RapierRigidBody;
  /** Punto de anclaje en el mundo (si enganchó terreno o poste estático). */
  anchorWorldPoint: Vector3 | null;
  /** Cuerpo enganchado si es dinámico (ej. un auto amigo o un barril). */
  anchorBody: RapierRigidBody | null;
  /** Punto local en `anchorBody` donde mordió el gancho. */
  anchorLocalOffset: Vector3;
  /** Largo actual deseado del cable (metros). */
  cableLength: number;
  /** Si está enrollando activamente (`1`), soltando (`-1`) o trabado (`0`). */
  reelCommand: -1 | 0 | 1;
}

const CENTER = { x: 0, y: 0, z: 0 };
const _delta = new Vector3();
const _anchorWorld = new Vector3();
const _invClawRot = new Quaternion();
const _localPos = new Vector3();
const _localRot = new Quaternion();
const _bodyQuat = new Quaternion();

/**
 * Crea una junta de Rapier para `hinge`, `piston` o `bearing` manteniendo los contactos
 * desactivados entre las dos piezas unidas y configurando límites iniciales.
 */
export function createRoboticJoint(
  { world, rapier }: Pick<PhysicsContext, 'world' | 'rapier'>,
  id: string,
  kind: 'hinge' | 'piston' | 'bearing',
  parentBody: RapierRigidBody,
  childBody: RapierRigidBody,
  parentAnchor: { x: number; y: number; z: number },
  localAxis: { x: number; y: number; z: number },
): RoboticJointRecord {
  const spec = ROBOTICS_SPECS[kind];
  const descriptor =
    kind === 'piston'
      ? rapier.JointData.prismatic(parentAnchor, CENTER, localAxis)
      : rapier.JointData.revolute(parentAnchor, CENTER, localAxis);

  const joint = world.createImpulseJoint(descriptor, parentBody, childBody, true);
  joint.setContactsEnabled(false);

  if (spec.limits) {
    if (kind === 'piston') {
      const prismatic = joint as InstanceType<typeof rapier.PrismaticImpulseJoint>;
      prismatic.setLimits(spec.limits[0], spec.limits[1]);
      prismatic.configureMotorPosition(0, spec.stiffness, spec.damping);
    } else {
      const revolute = joint as InstanceType<typeof rapier.RevoluteImpulseJoint>;
      revolute.setLimits(spec.limits[0], spec.limits[1]);
      revolute.configureMotorPosition(0, spec.stiffness, spec.damping);
    }
  } else if (kind === 'bearing') {
    const revolute = joint as InstanceType<typeof rapier.RevoluteImpulseJoint>;
    revolute.configureMotorVelocity(0, spec.damping);
  }

  return { id, kind, joint, parentBody, childBody, target: 0 };
}

/**
 * Actualiza un actuador robótico a partir de una señal lógica o de control (`-1` a `1`).
 * - `hinge` y `piston`: interpolan suavemente su objetivo dentro de `spec.limits` usando `dt`.
 * - `bearing`: controla velocidad angular continua (`configureMotorVelocity`).
 * Nunca destruye ni recrea la junta en caliente.
 */
export function stepRoboticActuator(
  rapier: PhysicsContext['rapier'],
  record: RoboticJointRecord,
  signal: number,
  dt: number,
) {
  if (!record.joint.isValid() || !record.childBody.isValid()) return;
  const spec = ROBOTICS_SPECS[record.kind];
  const clampedSignal = Math.max(-1, Math.min(1, signal));

  if (record.kind === 'bearing') {
    const revolute = record.joint as InstanceType<typeof rapier.RevoluteImpulseJoint>;
    const targetVel = Math.abs(clampedSignal) < 0.05 ? 0 : clampedSignal * spec.maxSpeed;
    if (Math.abs(targetVel - record.target) > 1e-3) {
      record.target = targetVel;
      revolute.configureMotorVelocity(targetVel, targetVel === 0 ? spec.damping * 1.4 : spec.damping);
      record.childBody.wakeUp();
    }
    return;
  }

  const [minLim, maxLim] = spec.limits ?? [0, 1];
  // Señal > 0 avanza/extiende; señal === 0 mantiene o vuelve según el tipo:
  // En `piston`, señal 0..1 mapea directo a posición objetivo [min, max] para funcionar con switchBox/timerBox.
  let desiredTarget = record.target;
  if (record.kind === 'piston') {
    const goal = minLim + Math.max(0, clampedSignal) * (maxLim - minLim);
    const step = spec.maxSpeed * dt;
    desiredTarget =
      Math.abs(goal - record.target) <= step
        ? goal
        : record.target + Math.sign(goal - record.target) * step;
  } else {
    // En `hinge`, señal 1 abre hacia maxLim, -1 hacia minLim, 0 vuelve suave al centro si es switchBox
    const goal = clampedSignal * maxLim;
    const step = spec.maxSpeed * dt;
    desiredTarget =
      Math.abs(goal - record.target) <= step
        ? goal
        : record.target + Math.sign(goal - record.target) * step;
  }

  desiredTarget = Math.max(minLim, Math.min(maxLim, desiredTarget));
  if (Math.abs(desiredTarget - record.target) < 1e-4) return;
  record.target = desiredTarget;

  if (record.kind === 'piston') {
    const prismatic = record.joint as InstanceType<typeof rapier.PrismaticImpulseJoint>;
    prismatic.configureMotorPosition(desiredTarget, spec.stiffness, spec.damping);
  } else {
    const revolute = record.joint as InstanceType<typeof rapier.RevoluteImpulseJoint>;
    revolute.configureMotorPosition(desiredTarget, spec.stiffness, spec.damping);
  }
  record.childBody.wakeUp();
}

/**
 * Cierra la pinza (`claw`) soldando temporalmente el cuerpo rígido más cercano dentro de `gripRadius`.
 */
export function attachClawGrip(
  { world, rapier }: Pick<PhysicsContext, 'world' | 'rapier'>,
  state: ClawGripState,
  candidateBody: RapierRigidBody,
): boolean {
  if (state.gripJoint?.isValid() || !state.clawBody.isValid() || !candidateBody.isValid()) return false;
  if (candidateBody.handle === state.clawBody.handle) return false;

  const radius = ROBOTICS_SPECS.claw.gripRadius ?? 0.58;
  const clawPos = state.clawBody.translation();
  const candPos = candidateBody.translation();
  if (_delta.set(candPos.x - clawPos.x, candPos.y - clawPos.y, candPos.z - clawPos.z).length() > radius) {
    return false;
  }

  _invClawRot.copy(state.clawBody.rotation()).invert();
  _localPos.copy(_delta).applyQuaternion(_invClawRot);
  _localRot.copy(_invClawRot).multiply(_bodyQuat.copy(candidateBody.rotation())).normalize();

  const joint = world.createImpulseJoint(
    rapier.JointData.fixed(_localPos, _localRot, CENTER, { x: 0, y: 0, z: 0, w: 1 }),
    state.clawBody,
    candidateBody,
    true,
  );
  joint.setContactsEnabled(false);

  state.grabbedBody = candidateBody;
  state.gripJoint = joint;
  state.closed = true;
  candidateBody.wakeUp();
  return true;
}

/** Abre la pinza y libera el objeto agarrado. */
export function releaseClawGrip(world: PhysicsContext['world'], state: ClawGripState) {
  if (state.gripJoint?.isValid()) {
    world.removeImpulseJoint(state.gripJoint, true);
  }
  if (state.grabbedBody?.isValid()) {
    state.grabbedBody.wakeUp();
  }
  state.gripJoint = null;
  state.grabbedBody = null;
  state.closed = false;
}

/**
 * Simula la tensión del cabrestante (`winch`) en cada tick:
 * - Si `reelCommand === 1`, acorta `cableLength` para arrastrar el vehículo o la carga.
 * - Si la distancia real supera `cableLength`, aplica fuerza elástica acotada por `maxPullForce`
 *   sobre `winchBody` (y fuerza igual y opuesta sobre `anchorBody` si es dinámico).
 * Devuelve los dos extremos en espacio mundial para renderizar la soga en 3D.
 */
export function stepWinchTension(
  state: WinchState,
  dt: number,
): { start: Vector3; end: Vector3; tensionNorm: number } | null {
  if (!state.winchBody.isValid()) return null;
  const spec = ROBOTICS_SPECS.winch;
  const maxLen = spec.maxCableLength ?? 18;
  const maxForce = spec.maxPullForce ?? 3200;

  if (state.anchorBody) {
    if (!state.anchorBody.isValid()) {
      state.anchorBody = null;
      return null;
    }
    _anchorWorld
      .copy(state.anchorLocalOffset)
      .applyQuaternion(_bodyQuat.copy(state.anchorBody.rotation()))
      .add(state.anchorBody.translation());
  } else if (state.anchorWorldPoint) {
    _anchorWorld.copy(state.anchorWorldPoint);
  } else {
    return null;
  }

  const winchPos = state.winchBody.translation();
  const start = new Vector3(winchPos.x, winchPos.y, winchPos.z);
  const end = _anchorWorld.clone();

  if (state.reelCommand !== 0) {
    state.cableLength = Math.max(
      0.8,
      Math.min(maxLen, state.cableLength - state.reelCommand * spec.maxSpeed * dt),
    );
  }

  _delta.copy(end).sub(start);
  const dist = _delta.length();
  if (dist <= 1e-4) return { start, end, tensionNorm: 0 };

  const stretch = dist - state.cableLength;
  if (stretch <= 0) {
    return { start, end, tensionNorm: 0 };
  }

  const dirX = _delta.x / dist;
  const dirY = _delta.y / dist;
  const dirZ = _delta.z / dist;

  // Velocidad relativa a lo largo del cable para amortiguar rebotes
  const wv = state.winchBody.linvel();
  const av = state.anchorBody?.isValid() ? state.anchorBody.linvel() : CENTER;
  const relSpeedAlong = (wv.x - av.x) * dirX + (wv.y - av.y) * dirY + (wv.z - av.z) * dirZ;

  const rawForce = stretch * spec.stiffness - relSpeedAlong * spec.damping;
  const pullForce = Math.max(0, Math.min(maxForce, rawForce));
  const impulse = pullForce * dt;

  if (impulse > 0) {
    state.winchBody.applyImpulse({ x: dirX * impulse, y: dirY * impulse, z: dirZ * impulse }, true);
    if (state.anchorBody?.isValid() && !state.anchorBody.isFixed()) {
      state.anchorBody.applyImpulse(
        { x: -dirX * impulse, y: -dirY * impulse, z: -dirZ * impulse },
        true,
      );
    }
  }

  return { start, end, tensionNorm: Math.min(1, pullForce / maxForce) };
}

export function disposeRoboticActuator(
  world: PhysicsContext['world'],
  record: RoboticJointRecord,
) {
  if (record.joint.isValid()) {
    world.removeImpulseJoint(record.joint, true);
  }
}
// ---------- Integración con el taller ----------

export const ROBOTIC_KINDS: readonly RoboticPartKind[] = ['hinge', 'piston', 'bearing', 'claw', 'winch'];

/** Las 5 piezas son un solo tipo de pieza (`robotic`); la variante va en el id: `extra-robotic-hinge-4`. */
export function roboticKindFromId(id: string | null | undefined): RoboticPartKind | null {
  if (!id) return null;
  const m = /robotic-([a-z]+)-\d+$/.exec(id);
  return m && isRoboticPartKind(m[1]) ? m[1] : null;
}

/** Actuadores que articulan lo que se les suelda encima. */
export function actuatorKindFromId(id: string | null | undefined): 'hinge' | 'piston' | 'bearing' | null {
  const k = roboticKindFromId(id);
  return k === 'hinge' || k === 'piston' || k === 'bearing' ? k : null;
}

/** Eje local del actuador: bisagra gira en X, base giratoria en Y, pistón se estira en Z. */
export function actuatorAxis(kind: 'hinge' | 'piston' | 'bearing') {
  return kind === 'hinge' ? { x: 1, y: 0, z: 0 } : kind === 'bearing' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
}

export function roboticHalfExtents(kind: RoboticPartKind): [number, number, number] {
  const [x, y, z] = ROBOTICS_SPECS[kind].size;
  return [x / 2, y / 2, z / 2];
}

/** Sogas activas de los cabrestantes (las dibuja RoboticRopes). */
export const winchRopes = new Map<string, { start: Vector3; end: Vector3; tensionNorm: number }>();
