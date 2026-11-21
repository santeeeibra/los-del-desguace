// Las bandejas quedan fuera del espacio de armado y de la salida al arco.
export const STARTER_TRAY = { x: 0, z: 1.65, width: 7.5, depth: 1.05 };
export const PARTS_TRAYS = [
  { x: -1.05, z: -3.65, width: 10.4, depth: 1.05, slots: 9 },
  { x: -1.05, z: -4.82, width: 10.4, depth: 1.05, slots: 9 },
  { x: 6.25, z: -3.9, width: 5.5, depth: 1.05, slots: 5 },
  { x: 6.25, z: -5.1, width: 4.6, depth: 1.05, slots: 4 },
];
export const TRAY_HEIGHT = 0.16;

export function starterPartPosition(index: number): [number, number, number] {
  return [STARTER_TRAY.x + (index - 3) * 1.04, TRAY_HEIGHT + 0.51, STARTER_TRAY.z];
}

export function stockedPartPosition(index: number): [number, number, number] {
  for (const tray of PARTS_TRAYS) {
    if (index < tray.slots) return [tray.x + (index - (tray.slots - 1) / 2) * 1.11, TRAY_HEIGHT + 0.52, tray.z];
    index -= tray.slots;
  }
  throw new RangeError('No hay espacio en las bandejas de repuestos');
}

export function extraPartPosition(index: number): [number, number, number] {
  // Plataforma de carga al este, con una rampa al norte.
  return [4.92 + (index % 4) * 1.04, 1.62, 0.68 + Math.floor(index / 4) * 0.7];
}
