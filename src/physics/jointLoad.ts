/**
 * Estimación de la carga que soporta una unión (junta rompible por impacto o tensión).
 *
 * Rapier no expone el impulso de una unión, así que se estima desde el cuerpo hijo:
 * la fuerza "no gravitatoria" que recibe es F = m · (a − g), con `a` la aceleración medida entre dos pasos.
 * Incluye choques (picos de aceleración), tirones (imán, propulsores) y el peso que sostiene (m·|g|).
 * Por eso los umbrales conviene darlos como múltiplo del peso: ver `weightMultiple`.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface BodyKinematics {
  mass: number;
  linvel: Vec3Like;
  angvel: Vec3Like;
  /** Inercia escalar aproximada (kg·m²). */
  inertia: number;
}

export interface JointLoad {
  /** Newtons (estimados). */
  force: number;
  /** N·m (estimados). */
  torque: number;
}

export interface BreakLimits {
  /** Fuerza máxima (N) antes de soltarse. Sin valor = no se rompe por fuerza. */
  breakForce?: number;
  /** Par máximo (N·m) antes de soltarse. Sin valor = no se rompe por giro. */
  breakTorque?: number;
}

/** Gravedad del mundo (`<Physics gravity={[0, -18, 0]}>`). */
export const WORLD_GRAVITY_Y = -18;

/** Fuerza equivalente a `multiple` veces el peso de una pieza de `mass` kg. */
export function weightMultiple(mass: number, multiple: number, gravityY = WORLD_GRAVITY_Y): number {
  return mass * Math.abs(gravityY) * multiple;
}

/** Carga estimada entre dos muestras consecutivas, o `null` si falta la muestra previa. */
export function estimateJointLoad(
  prev: BodyKinematics | undefined,
  cur: BodyKinematics,
  dt: number,
  gravityY = WORLD_GRAVITY_Y,
): JointLoad | null {
  if (!prev || !(dt > 0) || !(cur.mass > 0)) return null;
  const ax = (cur.linvel.x - prev.linvel.x) / dt;
  const ay = (cur.linvel.y - prev.linvel.y) / dt;
  const az = (cur.linvel.z - prev.linvel.z) / dt;
  const force = cur.mass * Math.hypot(ax, ay - gravityY, az);
  const dwx = cur.angvel.x - prev.angvel.x;
  const dwy = cur.angvel.y - prev.angvel.y;
  const dwz = cur.angvel.z - prev.angvel.z;
  const torque = cur.inertia * (Math.hypot(dwx, dwy, dwz) / dt);
  return { force, torque };
}

export function hasBreakLimits(limits: BreakLimits | undefined): limits is BreakLimits {
  return Boolean(limits && (limits.breakForce !== undefined || limits.breakTorque !== undefined));
}

/** Muestras que se ignoran tras empezar a seguir una unión (teletransportes, montaje, soltar). */
const GRACE_SAMPLES = 8;
/** Muestras seguidas por encima del umbral para soltar (filtra picos de un solo paso). */
const CONFIRM_SAMPLES = 2;
/** Un golpe de este múltiplo del umbral suelta la unión de inmediato. */
const INSTANT_FACTOR = 2.5;

interface TrackedJoint {
  last: BodyKinematics;
  grace: number;
  over: number;
}

/** Sigue varias uniones a la vez y avisa cuándo una supera su umbral. */
export class BreakMonitor {
  private tracked = new Map<string, TrackedJoint>();

  /** Devuelve `true` cuando la unión `key` debe soltarse. */
  update(key: string, cur: BodyKinematics, limits: BreakLimits, dt: number, gravityY = WORLD_GRAVITY_Y): boolean {
    const entry = this.tracked.get(key);
    if (!entry) {
      this.tracked.set(key, { last: cur, grace: GRACE_SAMPLES, over: 0 });
      return false;
    }
    const load = estimateJointLoad(entry.last, cur, dt, gravityY);
    entry.last = cur;
    if (entry.grace > 0) {
      entry.grace -= 1;
      return false;
    }
    if (!load) return false;
    const ratio = Math.max(
      limits.breakForce !== undefined && limits.breakForce > 0 ? load.force / limits.breakForce : 0,
      limits.breakTorque !== undefined && limits.breakTorque > 0 ? load.torque / limits.breakTorque : 0,
    );
    if (ratio >= INSTANT_FACTOR) return true;
    entry.over = ratio >= 1 ? entry.over + 1 : 0;
    return entry.over >= CONFIRM_SAMPLES;
  }

  reset(key: string): void {
    this.tracked.delete(key);
  }

  clear(): void {
    this.tracked.clear();
  }
}
