import type { Vector3 } from 'three';

export const WRENCH_REACH = 7;
const MARKER_RADIUS = 0.2;
const SURFACE_MARGIN = 0.12;

export function wrenchMarkerScore(
  origin: Vector3, direction: Vector3, marker: Vector3, firstHit: number,
) {
  const x = marker.x - origin.x;
  const y = marker.y - origin.y;
  const z = marker.z - origin.z;
  const depth = direction.x * x + direction.y * y + direction.z * z;
  const distanceSq = x * x + y * y + z * z;
  if (depth < 0 || distanceSq > WRENCH_REACH ** 2 || depth > firstHit + SURFACE_MARGIN) return Infinity;
  const lateralSq = Math.max(0, distanceSq - depth * depth);
  return lateralSq < MARKER_RADIUS ** 2 ? lateralSq : Infinity;
}
