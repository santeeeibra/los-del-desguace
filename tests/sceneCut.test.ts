import { describe, expect, it } from 'vitest';
import { computeCutPreview, outlineSegments } from '../src/invention/sceneCut';
import { countCells, PLATFORM_TEMPLATES, rasterize } from '../src/invention/platformShape';

const grid = rasterize(PLATFORM_TEMPLATES.triangle.points);
const info = (z: number) => ({
  id: 'p', inAssembly: true, released: false, carried: false,
  children: [{ id: 'rueda', kind: 'wheel' as const, pose: { position: { x: 0, y: 0, z } }, steer: null }],
});

describe('Cortar en escena', () => {
  it('un recorte en U marcado con puntos (de afuera a afuera) quita material del frente', () => {
    const u = [{ x: -0.3, z: 0.9 }, { x: -0.3, z: 0.73 }, { x: 0.3, z: 0.73 }, { x: 0.3, z: 0.9 }];
    const preview = computeCutPreview(grid, u, info(1.2));
    expect(preview.error).toBeNull();
    expect(preview.removedRects.length).toBeGreaterThan(0);
    expect(countCells(preview.remaining)).toBeLessThan(countCells(grid));
    expect(outlineSegments(preview.remaining).length).toBeGreaterThan(0);
    expect(preview.loose).toEqual([]);
  });

  it('pide empezar y terminar afuera del borde', () => {
    const inside = [{ x: 0, z: 0 }, { x: 0.2, z: 0.9 }, { x: -0.2, z: 0.9 }];
    expect(computeCutPreview(grid, inside, null).error).toMatch(/afuera del borde/);
    expect(computeCutPreview(grid, [{ x: 0, z: 1 }], null).error).toMatch(/3 puntos/);
  });

  it('avisa qué unión queda sin apoyo', () => {
    const deep = [{ x: -0.3, z: 0.9 }, { x: -0.3, z: 0.45 }, { x: 0.3, z: 0.45 }, { x: 0.3, z: 0.9 }];
    expect(computeCutPreview(grid, deep, info(1.2)).loose).toEqual(['rueda']);
  });
});
