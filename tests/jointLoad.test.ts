import { describe, expect, it } from 'vitest';
import {
  BreakMonitor,
  estimateJointLoad,
  hasBreakLimits,
  weightMultiple,
  WORLD_GRAVITY_Y,
  type BodyKinematics,
} from '../src/physics/jointLoad';

const DT = 1 / 60;

function kin(vx: number, vy: number, vz: number, mass = 4, wy = 0): BodyKinematics {
  return { mass, linvel: { x: vx, y: vy, z: vz }, angvel: { x: 0, y: wy, z: 0 }, inertia: 0.2 };
}

describe('estimateJointLoad', () => {
  it('sin muestra previa no estima nada', () => {
    expect(estimateJointLoad(undefined, kin(0, 0, 0), DT)).toBeNull();
  });

  it('en reposo la unión sostiene el peso de la pieza (m·|g|)', () => {
    const load = estimateJointLoad(kin(0, 0, 0), kin(0, 0, 0), DT)!;
    expect(load.force).toBeCloseTo(4 * Math.abs(WORLD_GRAVITY_Y), 5);
    expect(load.torque).toBeCloseTo(0, 5);
  });

  it('un golpe (salto de velocidad en un paso) dispara la fuerza', () => {
    const load = estimateJointLoad(kin(0, 0, 0), kin(12, 0, 0), DT)!;
    expect(load.force).toBeGreaterThan(weightMultiple(4, 20));
  });

  it('un giro brusco dispara el par', () => {
    const load = estimateJointLoad(kin(0, 0, 0), kin(0, 0, 0, 4, 8), DT)!;
    expect(load.torque).toBeCloseTo(0.2 * (8 / DT), 4);
  });
});

describe('BreakMonitor', () => {
  const limits = { breakForce: weightMultiple(4, 16) };

  function feed(monitor: BreakMonitor, speeds: number[]) {
    let broke = false;
    for (const vx of speeds) broke = monitor.update('a', kin(vx, 0, 0), limits, DT) || broke;
    return broke;
  }

  it('no suelta una unión que solo sostiene su peso', () => {
    const monitor = new BreakMonitor();
    expect(feed(monitor, Array(60).fill(0))).toBe(false);
  });

  it('ignora el período de gracia inicial aunque haya un golpe', () => {
    const monitor = new BreakMonitor();
    expect(feed(monitor, [0, 20, 0, 20])).toBe(false);
  });

  it('suelta la unión con un golpe fuerte después de la gracia', () => {
    const monitor = new BreakMonitor();
    expect(feed(monitor, [...Array(12).fill(0), 30])).toBe(true);
  });

  it('un golpe suave por debajo del umbral no la suelta', () => {
    const monitor = new BreakMonitor();
    // Δv = 0.5 m/s en un paso => a = 30 m/s², bien por debajo de 16 veces el peso.
    expect(feed(monitor, [...Array(12).fill(0), 0.5, 0.5, 0.5])).toBe(false);
  });

  it('reset reinicia la gracia', () => {
    const monitor = new BreakMonitor();
    feed(monitor, Array(12).fill(0));
    monitor.reset('a');
    expect(feed(monitor, [0, 30])).toBe(false);
  });
});

describe('hasBreakLimits', () => {
  it('detecta si hay algún umbral', () => {
    expect(hasBreakLimits(undefined)).toBe(false);
    expect(hasBreakLimits({})).toBe(false);
    expect(hasBreakLimits({ breakTorque: 5 })).toBe(true);
  });
});
