import type { ContraptionBlueprint } from '../logic/blueprintManager';

/**
 * Cola de pedidos para armar (o desarmar) inventos del propio nivel, por ejemplo los autos viejos del patio
 * del nivel nocturno. `PlayerRig` la procesa cuadro a cuadro: espera a que existan los cuerpos de las piezas
 * y arma el plano con las mismas soldaduras que usa el taller (así la Amoladora las corta igual).
 */
export type YardRequest =
  | { type: 'assemble'; blueprint: ContraptionBlueprint; at: readonly [number, number, number]; tries: number }
  | { type: 'clear'; rootIds: readonly string[] };

const queue: YardRequest[] = [];

export const MAX_YARD_TRIES = 900;

export const yardAssembly = {
  assemble(blueprint: ContraptionBlueprint, at: readonly [number, number, number]) {
    queue.push({ type: 'assemble', blueprint, at, tries: 0 });
  },
  clear(rootIds: readonly string[]) {
    queue.push({ type: 'clear', rootIds });
  },
  /** Pedidos pendientes (la lista es viva: quien procesa quita los resueltos). */
  pending(): YardRequest[] {
    return queue;
  },
};

/** Plano de un auto viejo: chasis con 4 ruedas, motor y batería soldados. Posiciones locales al chasis. */
export function donorCarBlueprint(
  name: string,
  parts: { chassis: string; wheels: readonly [string, string, string, string]; engine: string; battery: string },
): ContraptionBlueprint {
  const { chassis, wheels, engine, battery } = parts;
  const child = (
    partId: string,
    kind: 'wheel' | 'part' | 'battery',
    localPos: [number, number, number],
    axle?: { x: number; y: number; z: number },
  ) => ({
    partId,
    kind,
    slotId: `part:${chassis}:${partId}`,
    parentId: chassis,
    localPos,
    localRot: [0, 0, 0, 1] as [number, number, number, number],
    ...(axle ? { axle } : {}),
  });
  const axle = { x: 1, y: 0, z: 0 };
  return {
    version: 1,
    id: `donor_${chassis}`,
    name,
    rootPartId: chassis,
    category: 'free',
    createdAt: 0,
    parts: [
      { partId: chassis, kind: 'chassis', slotId: `root:${chassis}`, localPos: [0, 0, 0], localRot: [0, 0, 0, 1] },
      child(wheels[0], 'wheel', [-0.92, -0.1, 0.96], axle),
      child(wheels[1], 'wheel', [0.92, -0.1, 0.96], axle),
      child(wheels[2], 'wheel', [-0.92, -0.1, -0.96], axle),
      child(wheels[3], 'wheel', [0.92, -0.1, -0.96], axle),
      child(engine, 'part', [0, 0.3, 0.55]),
      child(battery, 'battery', [0, 0.3, -0.55]),
    ],
    logic: { version: 1, nodes: [], wires: [] },
  };
}
