import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyBodyOutline } from '../src/character/body/bodyOutline';

describe('contorno corporal', () => {
  it('libera la geometría compartida al retirar el último contorno', () => {
    const source = new THREE.BoxGeometry().toNonIndexed();
    const first = new THREE.Mesh(source);
    const second = new THREE.Mesh(source);
    first.userData.outline = true;
    second.userData.outline = true;

    const removeFirst = applyBodyOutline(first);
    const removeSecond = applyBodyOutline(second);
    const hull = first.children[0] as THREE.Mesh;
    const derived = hull.geometry;
    const dispose = vi.spyOn(derived, 'dispose');
    expect(derived).not.toBe(source);
    expect((second.children[0] as THREE.Mesh).geometry).toBe(derived);

    removeFirst();
    removeFirst();
    expect(first.children).toHaveLength(0);
    expect(dispose).not.toHaveBeenCalled();
    removeSecond();
    expect(second.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledTimes(1);

    const removeReplacement = applyBodyOutline(first);
    expect((first.children[0] as THREE.Mesh).geometry).not.toBe(derived);
    removeReplacement();
    source.dispose();
  });
});
