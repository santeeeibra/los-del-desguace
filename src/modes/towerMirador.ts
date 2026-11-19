export const TOWER_ORIGIN: [number, number, number] = [-17.8, 0, 3.15];
export const TOWER_DECK_HEIGHT = 3.64;

export const TOWER_STEPS = Array.from({ length: 9 }, (_, index) => ({
  x: 8.55 - index * 0.81,
  top: (index + 1) * 0.36,
}));

export function isInTowerNutReach(position: { x: number; y: number; z: number }): boolean {
  const dx = position.x - TOWER_ORIGIN[0];
  const dz = position.z - TOWER_ORIGIN[2];
  return dx * dx + dz * dz <= 1.2 ** 2 &&
    position.y >= TOWER_DECK_HEIGHT + 0.25 &&
    position.y <= TOWER_DECK_HEIGHT + 2.35;
}
