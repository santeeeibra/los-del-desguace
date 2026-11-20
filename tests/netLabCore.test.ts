import { describe, expect, it } from 'vitest';
import { GuestMetrics, SnapshotBuffer, evaluate, percentile, type Snapshot } from '../src/dev/netLab/netLabCore';

const snap = (tick: number, hostTime: number, x: number): Snapshot => ({
  tick,
  hostTime,
  box: { p: [x, 0.3, 0], q: [0, 0, 0, 1], v: 1 },
  owner: null,
  resets: 0,
  players: {},
});

describe('prueba de red: interpolación', () => {
  it('interpola entre snapshots y no extrapola más allá del último', () => {
    const b = new SnapshotBuffer();
    b.push(snap(1, 1000, 0));
    b.push(snap(2, 1050, 1));
    b.push(snap(2, 1060, 9)); // tick repetido: se ignora
    expect(b.sample(1025)?.p[0]).toBeCloseTo(0.5);
    expect(b.sample(900)?.p[0]).toBe(0);
    expect(b.sample(2000)?.p[0]).toBe(1);
  });
});

describe('prueba de red: métricas', () => {
  it('cuenta huecos, saltos y teletransportes', () => {
    const m = new GuestMetrics();
    m.onSnapshot(0);
    m.onSnapshot(50);
    m.onSnapshot(400); // hueco de 350 ms
    expect(m.gaps).toBe(1);
    m.onFrame([0, 0, 0], 0, 1 / 60);
    m.onFrame([0.05, 0, 0], 3, 1 / 60); // dentro de lo que permite 3 m/s
    m.onFrame([0.3, 0, 0], 0, 1 / 60); // salto de 25 cm sin velocidad
    m.onFrame([1.3, 0, 0], 0, 1 / 60); // teletransporte de 1 m
    expect(m.jumps).toBe(1);
    expect(m.teleports).toBe(1);
  });

  it('no cuenta como fallo el hueco de una reconexión', () => {
    const m = new GuestMetrics();
    m.onSnapshot(0);
    m.resetContinuity();
    m.onSnapshot(4000);
    expect(m.gaps).toBe(0);
  });

  it('aplica los criterios de aprobación', () => {
    const m = new GuestMetrics();
    m.rtt.push(20, 30, 40);
    for (let i = 0; i <= 100; i++) m.onSnapshot(i * 50);
    m.onRest([0, 0, 0], [0.005, 0, 0]);
    const s = m.summary(5000);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(evaluate(s, 'lan')).toEqual({ rtt: true, snapshots: true, gaps: true, teleports: true, jumps: true, rest: true, reconnect: true });
    m.reconnects.push(7000);
    expect(evaluate(m.summary(5000), 'lan').reconnect).toBe(false);
  });
});
