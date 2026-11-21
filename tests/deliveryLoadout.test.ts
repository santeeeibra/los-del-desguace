import { describe, expect, it } from 'vitest';
import { loadoutEffects, missingToStart, placePiece, removePiece, type Loadout } from '../src/modes/delivery/deliveryLoadout';

function build(steps: [Parameters<typeof placePiece>[1], Parameters<typeof placePiece>[2]][]): Loadout {
  let l: Loadout = {};
  for (const [slot, piece] of steps) {
    const r = placePiece(l, slot, piece);
    if (!r.ok) throw new Error(r.reason);
    l = r.loadout;
  }
  return l;
}

describe('Entrega Delicada: slots', () => {
  it('cada pieza solo encastra en su lugar', () => {
    expect(placePiece({}, 'M', 'wheel_big')).toEqual({ ok: false, reason: 'Rueda grande no va en ese lugar' });
    expect(placePiece({}, 'D', 'bumper').ok).toBe(true);
  });

  it('rechaza tamaños mezclados en el mismo eje pero permite ejes distintos', () => {
    const front = build([['R1', 'wheel_small']]);
    expect(placePiece(front, 'R2', 'wheel_big')).toEqual({ ok: false, reason: 'Mismo tamaño en cada eje' });
    expect(placePiece(front, 'R3', 'wheel_big').ok).toBe(true);
  });

  it('respeta las cantidades del banco y los lugares ocupados', () => {
    const l = build([['M', 'motor_strong']]);
    expect(placePiece(l, 'M', 'motor_soft')).toEqual({ ok: false, reason: 'Ese lugar ya está ocupado' });
    expect(placePiece(removePiece(l, 'M'), 'M', 'motor_strong', { motor_strong: 1 })).toEqual({ ok: false, reason: 'No quedan piezas: Motor fuerte' });
  });

  it('dice qué falta para arrancar', () => {
    expect(missingToStart({})).toEqual(['Faltan 4 ruedas', 'Falta el motor']);
    const ready = build([['R1', 'wheel_big'], ['R2', 'wheel_big'], ['R3', 'wheel_small'], ['R4', 'wheel_small'], ['M', 'motor_soft']]);
    expect(missingToStart(ready)).toEqual([]);
  });

  it('las piezas tienen ventajas y costos', () => {
    const big = build([['R1', 'wheel_big'], ['R2', 'wheel_big'], ['R3', 'wheel_big'], ['R4', 'wheel_big']]);
    const small = build([['R1', 'wheel_small'], ['R2', 'wheel_small'], ['R3', 'wheel_small'], ['R4', 'wheel_small']]);
    expect(loadoutEffects(big).tipRisk).toBeGreaterThan(loadoutEffects(small).tipRisk);
    expect(loadoutEffects(big).bumpHarshness).toBeLessThan(loadoutEffects(small).bumpHarshness);
    const guarded = build([['B', 'railings'], ['C', 'shock_absorber'], ['D', 'bumper']]);
    expect(loadoutEffects(guarded)).toMatchObject({ sideCounterweight: false, extraMassKg: 15, shockAbsorber: true, bumper: true });
    expect(loadoutEffects(guarded).tipRisk).toBeGreaterThan(loadoutEffects(build([['B', 'railings']])).tipRisk);
  });
});
