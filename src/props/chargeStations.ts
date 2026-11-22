/**
 * Estaciones de carga (generadores del taller o del nivel). Una batería `discharged` se recarga
 * conectándola con la Pinza de Cables (`5`) cuando el jugador está cerca de una estación.
 */
export const CHARGE_REACH = 3.4;

const stations = new Map<string, readonly [number, number, number]>();

export function registerChargeStation(id: string, position: readonly [number, number, number]): () => void {
  stations.set(id, position);
  return () => {
    if (stations.get(id) === position) stations.delete(id);
  };
}

/** Estación más cercana dentro de `reach`, o `null`. */
export function nearestChargeStation(x: number, y: number, z: number, reach = CHARGE_REACH): string | null {
  let best: string | null = null;
  let bestDist = reach;
  for (const [id, [sx, sy, sz]] of stations) {
    const dist = Math.hypot(sx - x, sy - y, sz - z);
    if (dist <= bestDist) {
      best = id;
      bestDist = dist;
    }
  }
  return best;
}
