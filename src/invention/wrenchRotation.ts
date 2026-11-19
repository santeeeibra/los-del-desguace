import { Quaternion, Vector3 } from 'three';

export const WRENCH_STEP = Math.PI / 12;
export const WRENCH_AXES = ['vertical', 'lateral', 'frontal'] as const;
export type WrenchAxis = (typeof WRENCH_AXES)[number];

const AXIS_VECTORS = {
  vertical: new Vector3(0, 1, 0),
  lateral: new Vector3(1, 0, 0),
  frontal: new Vector3(0, 0, 1),
};

export function wrenchStep(out: Quaternion, axis: WrenchAxis, direction: number) {
  return out.setFromAxisAngle(AXIS_VECTORS[axis], WRENCH_STEP * direction);
}

type CarryVolume = { halfExtents: { x: number; y: number; z: number } } | { halfHeight: number; radius: number };

/** Bounding height of the collision shape after rotating it into its drop pose. */
export function rotatedHalfHeight(shape: CarryVolume, rotation: Quaternion) {
  return rotatedSupportDistance(shape, rotation, AXIS_VECTORS.vertical);
}

const localNormal = new Vector3();
const inverseRotation = new Quaternion();

export function rotatedSupportDistance(shape: CarryVolume, rotation: Quaternion, normal: { x: number; y: number; z: number }) {
  inverseRotation.copy(rotation).invert();
  const { x, y, z } = localNormal.copy(normal).applyQuaternion(inverseRotation);
  const alongY = Math.min(1, Math.abs(y));
  if ('halfHeight' in shape) {
    return shape.halfHeight * alongY + shape.radius * Math.sqrt(Math.max(0, 1 - alongY * alongY));
  }
  return shape.halfExtents.x * Math.abs(x) + shape.halfExtents.y * alongY + shape.halfExtents.z * Math.abs(z);
}
