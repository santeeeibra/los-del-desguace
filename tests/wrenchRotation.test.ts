import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { rotatedHalfHeight, rotatedSupportDistance, wrenchStep, type WrenchAxis } from '../src/invention/wrenchRotation';
import { wrenchMarkerScore, WRENCH_REACH } from '../src/invention/wrenchTargeting';

describe('llave de armado', () => {
  it.each(['vertical', 'lateral', 'frontal'] as WrenchAxis[])('gira 15 grados en el eje %s y permite volver', (axis) => {
    const quaternion = wrenchStep(new Quaternion(), axis, 1);
    expect(quaternion.angleTo(new Quaternion())).toBeCloseTo(Math.PI / 12);
    quaternion.multiply(wrenchStep(new Quaternion(), axis, -1));
    expect(quaternion.angleTo(new Quaternion())).toBeCloseTo(0);
  });

  it('calcula el espacio bajo un bidón y un bloque después de girarlos', () => {
    const onItsSide = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    expect(rotatedHalfHeight({ halfHeight: 0.39, radius: 0.24 }, onItsSide)).toBeCloseTo(0.24);
    expect(rotatedHalfHeight({ halfExtents: { x: 0.29, y: 0.24, z: 0.2 } }, onItsSide)).toBeCloseTo(0.2);
  });

  it('reconoce solo el encastre apuntado, dentro del alcance y antes de una obstrucción', () => {
    const from = new Vector3();
    const direction = new Vector3(0, 0, 1);
    const aimed = new Vector3(0.09, 0, 6.6);
    expect(wrenchMarkerScore(from, direction, aimed, 6.65)).toBeCloseTo(0.09 ** 2);
    expect(wrenchMarkerScore(from, direction, aimed, 6.3)).toBe(Infinity);
    expect(wrenchMarkerScore(from, direction, new Vector3(0.4, 0, 6.6), 6.65)).toBe(Infinity);
    expect(wrenchMarkerScore(from, direction, new Vector3(0, 0, WRENCH_REACH + 0.01), WRENCH_REACH)).toBe(Infinity);
  });

  it('mantiene el volumen de una pieza girada fuera de la superficie apuntada', () => {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const normal = new Vector3(1, 0, 0);
    expect(rotatedSupportDistance({ halfExtents: { x: 0.29, y: 0.24, z: 0.2 } }, rotation, normal)).toBeCloseTo(0.2);
  });
});
