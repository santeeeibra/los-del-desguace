import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  buildFragmentGeometry, cuboidPoints, cylinderPoints, hullMetrics, planeRelativeTo, slicePoints,
} from '../src/invention/sliceGeometry';

describe('rebanar piezas', () => {
  it('parte una caja por la mitad en dos volúmenes iguales', () => {
    const box = cuboidPoints(0.5, 0.5, 0.5); // 1 m³
    const result = slicePoints(box, new Vector3(0, 1, 0), 0);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.above.volume).toBeCloseTo(0.5, 3);
    expect(result.below.volume).toBeCloseTo(0.5, 3);
    expect(result.above.centroid.y).toBeCloseTo(0.25, 3);
    expect(result.below.centroid.y).toBeCloseTo(-0.25, 3);
  });

  it('corte descentrado reparte el volumen según la posición', () => {
    const result = slicePoints(cuboidPoints(0.5, 0.5, 0.5), new Vector3(1, 0, 0), 0.25);
    if ('error' in result) throw new Error(result.error);
    expect(result.above.volume).toBeCloseTo(0.25, 3);
    expect(result.below.volume).toBeCloseTo(0.75, 3);
  });

  it('parte un cilindro con un plano inclinado y conserva el volumen total', () => {
    const cyl = cylinderPoints(0.48, 0.36);
    const total = hullMetrics(cyl)!.volume;
    const result = slicePoints(cyl, new Vector3(1, 1, 0), 0.1);
    if ('error' in result) throw new Error(result.error);
    expect(result.above.volume + result.below.volume).toBeCloseTo(total, 3);
  });

  it('rechaza un plano que no toca la pieza y los cortes de astilla', () => {
    const box = cuboidPoints(0.5, 0.5, 0.5);
    expect(slicePoints(box, new Vector3(0, 1, 0), 2)).toHaveProperty('error');
    expect(slicePoints(box, new Vector3(0, 1, 0), 0.49)).toHaveProperty('error');
  });

  it('se puede volver a cortar un trozo y pinta la cara del tajo', () => {
    const first = slicePoints(cuboidPoints(0.5, 0.5, 0.5), new Vector3(0, 1, 0), 0);
    if ('error' in first) throw new Error(first.error);
    const second = slicePoints(first.above.points, new Vector3(1, 0, 0), 0);
    if ('error' in second) throw new Error(second.error);
    expect(second.above.volume).toBeCloseTo(0.25, 3);
    const local = second.above.points.map((p) => p.clone().sub(second.above.centroid));
    const planes = [
      planeRelativeTo(new Vector3(0, 1, 0), 0, second.above.centroid),
      planeRelativeTo(new Vector3(1, 0, 0), 0, second.above.centroid),
    ];
    const geo = buildFragmentGeometry(local.map((p) => [p.x, p.y, p.z]), planes, { base: [0.5, 0.3, 0.1], cut: [1, 1, 1] })!;
    const colors = geo.getAttribute('color');
    let cutVerts = 0;
    for (let i = 0; i < colors.count; i++) if (colors.getX(i) === 1) cutVerts++;
    // Dos caras de corte rectangulares = 4 triángulos = 12 vértices.
    expect(cutVerts).toBe(12);
  });
});
