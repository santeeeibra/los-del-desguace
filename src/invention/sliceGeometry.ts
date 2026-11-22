/**
 * Rebanar piezas: geometría pura para partir cualquier cuerpo convexo con un plano.
 *
 * Cada pieza se representa por la nube de puntos de su casco convexo. Al cortar se obtienen dos nubes
 * (los puntos de cada lado + los cruces de las aristas con el plano); el casco de cada nube es
 * exactamente la mitad del cuerpo. De ahí salen el volumen (masa), el centro y la malla visible.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

export type V3 = [number, number, number];

/** Plano de corte guardado en coordenadas locales de un trozo: n·p = d (n unitaria). */
export interface CutPlane { n: V3; d: number }

export interface SliceHalf {
  /** Puntos del casco en el mismo espacio de entrada (mundo). */
  points: Vector3[];
  volume: number;
  centroid: Vector3;
}

export interface SliceResult {
  above: SliceHalf;
  below: SliceHalf;
}

const EPS = 1e-5;
/** Cada mitad debe tener al menos esta fracción del volumen total (evita cortes de astilla). */
export const MIN_HALF_RATIO = 0.04;

export function cuboidPoints(hx: number, hy: number, hz: number): Vector3[] {
  const out: Vector3[] = [];
  for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) out.push(new Vector3(x, y, z));
  return out;
}

/** Cilindro con el eje en Y (igual que Rapier). */
export function cylinderPoints(halfHeight: number, radius: number, segments = 24): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    out.push(new Vector3(x, -halfHeight, z), new Vector3(x, halfHeight, z));
  }
  return out;
}

export function ballPoints(radius: number, rings = 8, segments = 16): Vector3[] {
  const out: Vector3[] = [new Vector3(0, radius, 0), new Vector3(0, -radius, 0)];
  for (let r = 1; r < rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s < segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      out.push(new Vector3(
        Math.sin(phi) * Math.cos(th) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(th) * radius,
      ));
    }
  }
  return out;
}

function tryHull(points: Vector3[]): ConvexGeometry | null {
  if (points.length < 4) return null;
  try {
    const geometry = new ConvexGeometry(points);
    return geometry.getAttribute('position')?.count >= 12 ? geometry : null;
  } catch {
    return null;
  }
}

/** Volumen y centro de masa (densidad uniforme) del casco de una nube de puntos. */
export function hullMetrics(points: Vector3[]): { volume: number; centroid: Vector3 } | null {
  const hull = tryHull(points);
  if (!hull) return null;
  const pos = hull.getAttribute('position');
  const ref = new Vector3();
  for (const p of points) ref.add(p);
  ref.multiplyScalar(1 / points.length);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const cross = new Vector3();
  const centroid = new Vector3();
  let volume = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i).sub(ref);
    b.fromBufferAttribute(pos, i + 1).sub(ref);
    c.fromBufferAttribute(pos, i + 2).sub(ref);
    const v = Math.abs(cross.crossVectors(b, c).dot(a)) / 6;
    volume += v;
    centroid.addScaledVector(a.add(b).add(c), v / 4);
  }
  hull.dispose();
  if (volume < 1e-9) return null;
  centroid.multiplyScalar(1 / volume).add(ref);
  return { volume, centroid };
}

/**
 * Parte una nube de puntos con el plano n·p = d. Devuelve las dos mitades o un error en español
 * si el plano no atraviesa la pieza o deja una astilla.
 */
export function slicePoints(points: Vector3[], n: Vector3, d: number): SliceResult | { error: string } {
  const normal = n.clone().normalize();
  const dist = points.map((p) => normal.dot(p) - d);
  const above: Vector3[] = [];
  const below: Vector3[] = [];
  const crossing: Vector3[] = [];
  points.forEach((p, i) => {
    if (dist[i] > EPS) above.push(p.clone());
    else if (dist[i] < -EPS) below.push(p.clone());
    else crossing.push(p.clone());
  });
  if (!above.length || !below.length) return { error: 'El corte no atraviesa la pieza' };
  for (const pa of above) {
    const sa = normal.dot(pa) - d;
    for (const pb of below) {
      const sb = normal.dot(pb) - d;
      crossing.push(pa.clone().lerp(pb, sa / (sa - sb)));
    }
  }
  const upper = hullMetrics([...above, ...crossing]);
  const lower = hullMetrics([...below, ...crossing]);
  if (!upper || !lower) return { error: 'El corte queda demasiado al borde' };
  const total = upper.volume + lower.volume;
  if (upper.volume / total < MIN_HALF_RATIO || lower.volume / total < MIN_HALF_RATIO) {
    return { error: 'El corte queda demasiado al borde' };
  }
  return {
    above: { points: [...above, ...crossing], ...upper },
    below: { points: [...below, ...crossing], ...lower },
  };
}

export interface FragmentMeshColors { base: [number, number, number]; cut: [number, number, number] }

/**
 * Malla de un trozo: casco convexo con normales planas. Las caras que caen sobre un plano de corte
 * (cualquiera de los cortes acumulados) se pintan con el color de "corte" para que se vea el tajo.
 */
export function buildFragmentGeometry(points: V3[], planes: CutPlane[], colors: FragmentMeshColors): BufferGeometry | null {
  const hull = tryHull(points.map(([x, y, z]) => new Vector3(x, y, z)));
  if (!hull) return null;
  const pos = hull.getAttribute('position');
  const normals = hull.getAttribute('normal');
  const out: number[] = [];
  const rgb: number[] = [];
  const nrm: number[] = [];
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    out.push(v.x, v.y, v.z);
    nrm.push(normals.getX(i), normals.getY(i), normals.getZ(i));
  }
  for (let i = 0; i + 2 < pos.count; i += 3) {
    let onCut = false;
    for (const plane of planes) {
      let all = true;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, i + k);
        if (Math.abs(plane.n[0] * v.x + plane.n[1] * v.y + plane.n[2] * v.z - plane.d) > 1e-3) { all = false; break; }
      }
      if (all) { onCut = true; break; }
    }
    const color = onCut ? colors.cut : colors.base;
    for (let k = 0; k < 3; k++) rgb.push(...color);
  }
  hull.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(out, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  return geometry;
}

/** Pasa un plano (n·p = d en el espacio de origen) al espacio local de un trozo trasladado por `origin`. */
export function planeRelativeTo(n: Vector3, d: number, origin: Vector3): CutPlane {
  return { n: [n.x, n.y, n.z], d: d - n.dot(origin) };
}
