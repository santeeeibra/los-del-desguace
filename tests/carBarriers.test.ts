import { describe, expect, it } from 'vitest';
import {
  BARRIERS,
  CAR_CHUNK_COUNT,
  CAR_CHUNKS,
  CAR_SIZE,
  CARS_PER_ROW,
  WORLD_GRAVITY,
  carBreakForce,
  layoutBarrier,
  totalCars,
} from '../src/modes/carBarriers';

const ALLEY_HALF_WIDTH = 8.5;

describe('Barreras de autos (Nivel 2)', () => {
  it('arma 16 autos en la barrera liviana y 36 en la pesada, con tope de rendimiento', () => {
    expect(layoutBarrier('a')).toHaveLength(16);
    expect(layoutBarrier('b')).toHaveLength(36);
    expect(totalCars()).toBeLessThanOrEqual(60);
  });

  it('los autos caben en el ancho del callejón y no nacen solapados', () => {
    for (const id of ['a', 'b'] as const) {
      const cars = layoutBarrier(id);
      for (const c of cars) {
        expect(Math.abs(c.pos[0]) + CAR_SIZE[0] / 2).toBeLessThanOrEqual(ALLEY_HALF_WIDTH + 0.01);
        expect(c.pos[1]).toBeGreaterThanOrEqual(CAR_SIZE[1] / 2 - 1e-9);
      }
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const dx = Math.abs(cars[i].pos[0] - cars[j].pos[0]);
          const dy = Math.abs(cars[i].pos[1] - cars[j].pos[1]);
          const dz = Math.abs(cars[i].pos[2] - cars[j].pos[2]);
          const overlap = dx < CAR_SIZE[0] - 1e-6 && dy < CAR_SIZE[1] - 1e-6 && dz < CAR_SIZE[2] - 1e-6;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it('cada barrera queda centrada en su zona y la pesada es más masiva y alta que la liviana', () => {
    const a = layoutBarrier('a');
    const b = layoutBarrier('b');
    const zMean = (cars: typeof a) => cars.reduce((s, c) => s + c.pos[2], 0) / cars.length;
    expect(zMean(a)).toBeCloseTo(BARRIERS.a.zCenter, 5);
    expect(zMean(b)).toBeCloseTo(BARRIERS.b.zCenter, 5);
    expect(BARRIERS.b.mass).toBeGreaterThan(BARRIERS.a.mass * 3);
    expect(BARRIERS.b.high).toBeGreaterThan(BARRIERS.a.high);
    expect(a.every((c) => !c.weak)).toBe(true);
    expect(b.filter((c) => c.weak).length).toBe(12);
  });

  it('el umbral de rotura supera la carga estática de la pila y los débiles se rompen antes', () => {
    for (const id of ['a', 'b'] as const) {
      const def = BARRIERS[id];
      const staticLoad = def.mass * WORLD_GRAVITY * (def.high - 1);
      const strong = carBreakForce(def.mass, def.high, false);
      const weak = carBreakForce(def.mass, def.high, true);
      expect(strong).toBeGreaterThan(staticLoad * 2);
      expect(weak).toBeLessThan(strong);
      expect(weak).toBeGreaterThan(staticLoad);
    }
    // La pesada pide mucha más fuerza que la liviana
    expect(carBreakForce(BARRIERS.b.mass, BARRIERS.b.high, false))
      .toBeGreaterThan(carBreakForce(BARRIERS.a.mass, BARRIERS.a.high, false) * 2);
  });

  it('un auto roto deja los trozos definidos y pesa menos que entero', () => {
    expect(CAR_CHUNKS).toHaveLength(CAR_CHUNK_COUNT);
    expect(CARS_PER_ROW * CAR_SIZE[0]).toBeLessThanOrEqual(ALLEY_HALF_WIDTH * 2);
  });
});
