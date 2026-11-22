import { describe, expect, it } from 'vitest';
import { steerPivotLocal } from '../src/invention/platformShape';
import { qualifiesForSteering, steerLateralLimit, supportWidthAtCenter } from '../src/invention/workshopPhysics';

const AXLE_X = { x: 1, y: 0, z: 0 };

describe('Física emergente: dirección para N ruedas', () => {
  it('un auto de 4 ruedas apoya con toda su trocha', () => {
    const w = supportWidthAtCenter([
      { x: -0.6, z: 0.7 }, { x: 0.6, z: 0.7 }, { x: -0.6, z: -0.7 }, { x: 0.6, z: -0.7 },
    ]);
    expect(w).toBeCloseTo(1.2, 5);
    expect(steerLateralLimit(w)).toBe(9);
  });

  it('una bici de 6 ruedas en fila casi no tiene apoyo lateral', () => {
    const row = [-1.2, -0.7, -0.2, 0.3, 0.8, 1.3].map((z) => ({ x: 0, z }));
    const w = supportWidthAtCenter(row);
    expect(w).toBeLessThan(0.05);
    expect(steerLateralLimit(w)).toBe(4.5);
  });

  it('un triciclo apoya menos que su trocha trasera y queda en el medio', () => {
    const w = supportWidthAtCenter([{ x: 0, z: 1 }, { x: -0.6, z: -0.5 }, { x: 0.6, z: -0.5 }]);
    expect(w).toBeGreaterThan(0.5);
    expect(w).toBeLessThan(1.2);
    const lat = steerLateralLimit(w);
    expect(lat).toBeGreaterThan(4.5);
    expect(lat).toBeLessThan(9);
  });

  it('con el centro de masa fuera de las ruedas no hay apoyo', () => {
    expect(supportWidthAtCenter([{ x: -0.5, z: 0.5 }, { x: 0.5, z: 0.6 }])).toBe(0);
  });

  it('la rueda centrada gira sobre su propio centro; la del costado, sobre el borde', () => {
    expect(steerPivotLocal({ x: 0, y: 0, z: 1.1 }, AXLE_X)).toEqual({ x: 0, y: 0, z: 1.1 });
    const side = steerPivotLocal({ x: 0.5, y: 0, z: 1.1 }, AXLE_X);
    expect(side.z).toBeLessThan(1.1);
  });

  it('dirigen las ruedas de adelante del centro de masa', () => {
    expect(qualifiesForSteering({ x: 0, z: 0.5 }, AXLE_X)).toBe(true);
    expect(qualifiesForSteering({ x: 0, z: 0.5 }, AXLE_X, 0.6)).toBe(false);
    expect(qualifiesForSteering({ x: 0, z: -0.3 }, AXLE_X, -0.6)).toBe(true);
  });
});
