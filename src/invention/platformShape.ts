/**
 * Mesa de Corte Láser — geometría pura de las plataformas fabricadas.
 *
 * Una plataforma es una chapa plana vista desde arriba (plano local X/Z, +Z = frente).
 * La forma editable es un polígono de puntos; el material real se guarda en una grilla
 * de celdas que se usa para la física (rectángulos), el dibujo, los recortes desde el
 * borde, el apoyo de las piezas soldadas y el espacio de giro de las ruedas.
 */

export interface Pt { x: number; z: number }

export type PlatformTemplate = 'rect' | 'triangle' | 't' | 'u';

export const PLATFORM_CELL = 0.04;
export const PLATFORM_THICKNESS = 0.08;
export const PLATFORM_LIMIT = 1.3;
export const PLATFORM_DENSITY = 11; // kg por m²
export const MIN_PLATFORM_AREA = 0.06;
/** Radio del cordón de soldadura: una pieza sigue sujeta si queda material a esta distancia de su punto de unión. */
export const WELD_SUPPORT_RADIUS = 0.12;
/** Recorrido de diseño de una rueda de dirección (de tope a tope = ±STEER_DESIGN_MAX). */
export const STEER_DESIGN_MAX = 0.6;
export const WHEEL_RADIUS = 0.38;
export const WHEEL_HALF_WIDTH = 0.14;

export const PLATFORM_TEMPLATES: Record<PlatformTemplate, { label: string; points: Pt[] }> = {
  rect: {
    label: 'Rectangular',
    points: [{ x: -0.5, z: -0.7 }, { x: 0.5, z: -0.7 }, { x: 0.5, z: 0.7 }, { x: -0.5, z: 0.7 }],
  },
  // Triángulo con la punta hacia el frente; la nariz plana deja una cara donde soldar.
  triangle: {
    label: 'Triangular',
    points: [{ x: -0.62, z: -0.7 }, { x: 0.62, z: -0.7 }, { x: 0.22, z: 0.8 }, { x: -0.22, z: 0.8 }],
  },
  t: {
    label: 'En T',
    points: [
      { x: -0.18, z: -0.75 }, { x: 0.18, z: -0.75 }, { x: 0.18, z: 0.35 }, { x: 0.65, z: 0.35 },
      { x: 0.65, z: 0.75 }, { x: -0.65, z: 0.75 }, { x: -0.65, z: 0.35 }, { x: -0.18, z: 0.35 },
    ],
  },
  u: {
    label: 'En U',
    points: [
      { x: -0.6, z: -0.7 }, { x: 0.6, z: -0.7 }, { x: 0.6, z: 0.7 }, { x: 0.26, z: 0.7 },
      { x: 0.26, z: -0.25 }, { x: -0.26, z: -0.25 }, { x: -0.26, z: 0.7 }, { x: -0.6, z: 0.7 },
    ],
  },
};

export interface PlatformGrid {
  cell: number;
  /** Centro de la celda (0,0). */
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  data: Uint8Array;
}

export interface Rect { x: number; z: number; hx: number; hz: number }

export function clonePoints(points: readonly Pt[]): Pt[] {
  return points.map((p) => ({ x: p.x, z: p.z }));
}

export function pointInPolygon(x: number, z: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) sum += poly[j].x * poly[i].z - poly[i].x * poly[j].z;
  return Math.abs(sum) / 2;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function isSimplePolygon(poly: readonly Pt[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

export function clampPoint(p: Pt, limit = PLATFORM_LIMIT): Pt {
  return { x: Math.max(-limit, Math.min(limit, p.x)), z: Math.max(-limit, Math.min(limit, p.z)) };
}

/** Valida una forma editada; devuelve el motivo si no se puede fabricar. */
export function validateOutline(points: readonly Pt[]): string | null {
  if (points.length < 3) return 'Hacen falta al menos 3 puntos';
  if (!isSimplePolygon(points)) return 'Los bordes se cruzan: mové un punto';
  if (polygonArea(points) < MIN_PLATFORM_AREA) return 'La plataforma es demasiado chica';
  const grid = rasterize(points);
  if (countCells(grid) === 0 || componentCount(grid) !== 1) return 'La forma queda partida';
  return null;
}

/** Grilla vacía que cubre toda la zona editable (con una celda de margen libre en cada borde). */
export function emptyGrid(): PlatformGrid {
  const cell = PLATFORM_CELL;
  const half = Math.ceil(PLATFORM_LIMIT / cell) + 1;
  const n = half * 2;
  return { cell, x0: -half * cell + cell / 2, z0: -half * cell + cell / 2, nx: n, nz: n, data: new Uint8Array(n * n) };
}

export function cellCenter(grid: PlatformGrid, i: number, k: number): Pt {
  return { x: grid.x0 + i * grid.cell, z: grid.z0 + k * grid.cell };
}

export function rasterize(points: readonly Pt[]): PlatformGrid {
  const grid = emptyGrid();
  for (let k = 0; k < grid.nz; k++) {
    for (let i = 0; i < grid.nx; i++) {
      const c = cellCenter(grid, i, k);
      if (pointInPolygon(c.x, c.z, points)) grid.data[k * grid.nx + i] = 1;
    }
  }
  return grid;
}

export function cloneGrid(grid: PlatformGrid): PlatformGrid {
  return { ...grid, data: new Uint8Array(grid.data) };
}

export function countCells(grid: PlatformGrid): number {
  let n = 0;
  for (const v of grid.data) n += v;
  return n;
}

export function gridArea(grid: PlatformGrid): number {
  return countCells(grid) * grid.cell * grid.cell;
}

function at(grid: PlatformGrid, i: number, k: number): number {
  if (i < 0 || k < 0 || i >= grid.nx || k >= grid.nz) return 0;
  return grid.data[k * grid.nx + i];
}

export function componentCount(grid: PlatformGrid): number {
  const seen = new Uint8Array(grid.data.length);
  let count = 0;
  const stack: number[] = [];
  for (let idx = 0; idx < grid.data.length; idx++) {
    if (!grid.data[idx] || seen[idx]) continue;
    count++;
    stack.push(idx);
    seen[idx] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      const i = cur % grid.nx;
      const k = (cur - i) / grid.nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nk = k + dk;
        if (!at(grid, ni, nk)) continue;
        const n = nk * grid.nx + ni;
        if (!seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
  }
  return count;
}

/** Celdas vacías conectadas con el borde de la grilla (el "afuera" de la plataforma). */
function exteriorMask(grid: PlatformGrid): Uint8Array {
  const out = new Uint8Array(grid.data.length);
  const stack: number[] = [];
  const push = (i: number, k: number) => {
    const idx = k * grid.nx + i;
    if (grid.data[idx] || out[idx]) return;
    out[idx] = 1;
    stack.push(idx);
  };
  for (let i = 0; i < grid.nx; i++) { push(i, 0); push(i, grid.nz - 1); }
  for (let k = 0; k < grid.nz; k++) { push(0, k); push(grid.nx - 1, k); }
  while (stack.length) {
    const cur = stack.pop()!;
    const i = cur % grid.nx;
    const k = (cur - i) / grid.nx;
    if (i > 0) push(i - 1, k);
    if (i < grid.nx - 1) push(i + 1, k);
    if (k > 0) push(i, k - 1);
    if (k < grid.nz - 1) push(i, k + 1);
  }
  return out;
}

export interface CutResult {
  grid: PlatformGrid;
  removed: number[];
  error: string | null;
}

/**
 * Corte desde el borde: quita el material dentro del polígono de corte.
 * Solo se permite si el corte entra desde afuera (toca el borde exterior) y la chapa no queda partida.
 */
export function cutFromEdge(grid: PlatformGrid, cut: readonly Pt[]): CutResult {
  const next = cloneGrid(grid);
  const removed: number[] = [];
  if (cut.length < 3 || !isSimplePolygon(cut)) return { grid, removed, error: 'El corte tiene bordes cruzados' };
  const exterior = exteriorMask(grid);
  let touchesEdge = false;
  for (let k = 0; k < grid.nz; k++) {
    for (let i = 0; i < grid.nx; i++) {
      const c = cellCenter(grid, i, k);
      if (!pointInPolygon(c.x, c.z, cut)) continue;
      const idx = k * grid.nx + i;
      if (exterior[idx]) touchesEdge = true;
      if (grid.data[idx]) { next.data[idx] = 0; removed.push(idx); }
    }
  }
  if (!removed.length) return { grid, removed, error: 'El corte no toca material' };
  if (!touchesEdge) return { grid, removed, error: 'El corte tiene que entrar desde el borde' };
  if (countCells(next) * grid.cell * grid.cell < MIN_PLATFORM_AREA) return { grid, removed, error: 'Quedaría muy poco material' };
  if (componentCount(next) !== 1) return { grid, removed, error: 'El corte partiría la plataforma en dos' };
  return { grid: next, removed, error: null };
}

/** Une las celdas en rectángulos (filas fusionadas) para colisionadores y dibujo. */
export function gridToRects(grid: PlatformGrid): Rect[] {
  const used = new Uint8Array(grid.data.length);
  const rects: Rect[] = [];
  for (let k = 0; k < grid.nz; k++) {
    for (let i = 0; i < grid.nx; i++) {
      const idx = k * grid.nx + i;
      if (!grid.data[idx] || used[idx]) continue;
      let w = 1;
      while (i + w < grid.nx && grid.data[idx + w] && !used[idx + w]) w++;
      let h = 1;
      grow: while (k + h < grid.nz) {
        for (let d = 0; d < w; d++) {
          const n = (k + h) * grid.nx + i + d;
          if (!grid.data[n] || used[n]) break grow;
        }
        h++;
      }
      for (let dk = 0; dk < h; dk++) for (let d = 0; d < w; d++) used[(k + dk) * grid.nx + i + d] = 1;
      const a = cellCenter(grid, i, k);
      rects.push({
        x: a.x + ((w - 1) * grid.cell) / 2,
        z: a.z + ((h - 1) * grid.cell) / 2,
        hx: (w * grid.cell) / 2,
        hz: (h * grid.cell) / 2,
      });
    }
  }
  return rects.sort((p, q) => q.hx * q.hz - p.hx * p.hz);
}

export function gridBounds(grid: PlatformGrid) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let k = 0; k < grid.nz; k++) {
    for (let i = 0; i < grid.nx; i++) {
      if (!grid.data[k * grid.nx + i]) continue;
      const c = cellCenter(grid, i, k);
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
    }
  }
  const h = grid.cell / 2;
  return { minX: minX - h, maxX: maxX + h, minZ: minZ - h, maxZ: maxZ + h };
}

/** Punto de material más cercano (el punto de soldadura de una pieza vecina). */
export function nearestMaterial(grid: PlatformGrid, p: Pt): Pt | null {
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let k = 0; k < grid.nz; k++) {
    for (let i = 0; i < grid.nx; i++) {
      if (!grid.data[k * grid.nx + i]) continue;
      const c = cellCenter(grid, i, k);
      const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  return best;
}

export function hasMaterialNear(grid: PlatformGrid, p: Pt, radius = WELD_SUPPORT_RADIUS): boolean {
  const r2 = radius * radius;
  const span = Math.ceil(radius / grid.cell) + 1;
  const ci = Math.round((p.x - grid.x0) / grid.cell);
  const ck = Math.round((p.z - grid.z0) / grid.cell);
  for (let k = ck - span; k <= ck + span; k++) {
    for (let i = ci - span; i <= ci + span; i++) {
      if (!at(grid, i, k)) continue;
      const c = cellCenter(grid, i, k);
      if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 <= r2) return true;
    }
  }
  return false;
}

/** Una rueda con el centro a menos de esto del eje medio (x = 0) de su pieza gira sobre su propio centro. */
export const CENTERED_PIVOT_X = 0.06;

/**
 * Pivote de dirección de una rueda soldada de canto: el punto de la banda de rodadura que mira
 * hacia el centro de la pieza madre (donde queda el cordón de soldadura / la horquilla).
 * Una rueda centrada (x ≈ 0, como la delantera de un triciclo o una bici) gira sobre su propio
 * centro, para no barrer hacia los costados.
 */
export function steerPivotLocal(
  center: { x: number; y: number; z: number },
  axle: { x: number; y: number; z: number },
  radius = WHEEL_RADIUS,
) {
  if (Math.abs(center.x) < CENTERED_PIVOT_X && Math.abs(axle.x) > 0.9) return { x: center.x, y: center.y, z: center.z };
  // Dirección de rodadura en planta = perpendicular horizontal al eje.
  let rx = -axle.z;
  let rz = axle.x;
  const len = Math.hypot(rx, rz) || 1;
  rx /= len; rz /= len;
  if (rx * -center.x + rz * -center.z < 0) { rx = -rx; rz = -rz; }
  return { x: center.x + rx * radius, y: center.y, z: center.z + rz * radius };
}

export interface WheelFootprint {
  /** Centro de la rueda en el plano de la plataforma. */
  x: number;
  z: number;
  /** Pivote de dirección (si no se indica, gira sobre su centro). */
  px?: number;
  pz?: number;
  /** Altura del centro respecto del plano medio de la plataforma. */
  y: number;
  /** Ángulo (en planta) del eje de la rueda respecto de +X local. */
  axleYaw: number;
  radius?: number;
  halfWidth?: number;
}

/** Rectángulo (en planta) que ocupa la rueda girada `steer` radianes alrededor de su centro. */
export function wheelFootprintCorners(w: WheelFootprint, steer: number, inset = 0): Pt[] {
  const r = (w.radius ?? WHEEL_RADIUS) - inset;
  const hw = (w.halfWidth ?? WHEEL_HALF_WIDTH) - inset;
  const yaw = w.axleYaw + steer;
  // El centro de la rueda gira alrededor del pivote (misma convención que una rotación sobre +Y).
  const px = w.px ?? w.x;
  const pz = w.pz ?? w.z;
  const c = Math.cos(steer);
  const s = Math.sin(steer);
  const dx = w.x - px;
  const dz = w.z - pz;
  const cx = px + dx * c + dz * s;
  const cz = pz - dx * s + dz * c;
  // Eje de la rueda (ancho) y dirección de rodadura (largo), en planta.
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  const rx = -az;
  const rz = ax;
  return [
    { x: cx + ax * hw + rx * r, z: cz + az * hw + rz * r },
    { x: cx - ax * hw + rx * r, z: cz - az * hw + rz * r },
    { x: cx - ax * hw - rx * r, z: cz - az * hw - rz * r },
    { x: cx + ax * hw - rx * r, z: cz + az * hw - rz * r },
  ];
}

/**
 * Celdas de material que pisa la rueda en ese ángulo. La huella se agranda media celda (menos un
 * margen) para detectar roces de la chapa aunque no lleguen al centro de una celda.
 */
export function footprintHits(grid: PlatformGrid, w: WheelFootprint, steer: number, inset = 0.006 - PLATFORM_CELL / 2): number[] {
  const radius = w.radius ?? WHEEL_RADIUS;
  if (Math.abs(w.y) >= radius + PLATFORM_THICKNESS / 2 - 0.01) return [];
  const poly = wheelFootprintCorners(w, steer, inset);
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const i0 = Math.max(0, Math.floor((minX - grid.x0) / grid.cell));
  const i1 = Math.min(grid.nx - 1, Math.ceil((maxX - grid.x0) / grid.cell));
  const k0 = Math.max(0, Math.floor((minZ - grid.z0) / grid.cell));
  const k1 = Math.min(grid.nz - 1, Math.ceil((maxZ - grid.z0) / grid.cell));
  const hits: number[] = [];
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const idx = k * grid.nx + i;
      if (!grid.data[idx]) continue;
      const c = cellCenter(grid, i, k);
      if (pointInPolygon(c.x, c.z, poly)) hits.push(idx);
    }
  }
  return hits;
}

const STEER_SAMPLE = Math.PI / 180;

/** Recorrido libre de una rueda de dirección: hasta dónde gira hacia cada lado sin chocar con la chapa. */
export function steerClearance(grid: PlatformGrid, w: WheelFootprint, design = STEER_DESIGN_MAX) {
  const sweep = (sign: number) => {
    let free = 0;
    for (let a = STEER_SAMPLE; a <= design + 1e-9; a += STEER_SAMPLE) {
      if (footprintHits(grid, w, sign * a).length) break;
      free = a;
    }
    return free;
  };
  return { min: -sweep(-1), max: sweep(1) };
}

/** Celdas que invaden el espacio de giro de tope a tope (para marcarlas en rojo). */
export function sweepHits(grid: PlatformGrid, w: WheelFootprint, design = STEER_DESIGN_MAX): Set<number> {
  const out = new Set<number>();
  for (let a = -design; a <= design + 1e-9; a += STEER_SAMPLE * 2) {
    for (const idx of footprintHits(grid, w, a)) out.add(idx);
  }
  return out;
}

/** Hay material en el punto (x, z) de la plataforma. */
export function hasCellAt(grid: PlatformGrid, x: number, z: number): boolean {
  const i = Math.round((x - grid.x0) / grid.cell);
  const k = Math.round((z - grid.z0) / grid.cell);
  if (i < 0 || k < 0 || i >= grid.nx || k >= grid.nz) return false;
  return grid.data[k * grid.nx + i] === 1;
}

/** Holgura por lado entre la rueda y cada brazo de la horquilla (m). */
export const FORK_SIDE_CLEARANCE = 0.03;
/** Distancia máxima a la que se busca cada brazo de la horquilla (m). */
export const FORK_SCAN_REACH = 0.9;
/** Ancho de hueco que deja la rueda girar unos 20° hacia cada lado sin tocar los brazos. */
export function forkGapWidth(halfWidth = WHEEL_HALF_WIDTH) {
  return 2 * halfWidth + 0.28;
}

export interface ForkGap {
  /** Borde interno del brazo izquierdo (x local de la plataforma). */
  left: number;
  /** Borde interno del brazo derecho. */
  right: number;
  width: number;
  /** Centro exacto del hueco: donde queda centrada la rueda. */
  centerX: number;
}

/**
 * Montaje en horquilla: desde el punto (x, z) busca material hacia -X y +X (los dos "rayos" cortos,
 * resueltos contra la forma de la plataforma). Si ambos lados tocan la pieza y el hueco es compatible con
 * el ancho de la rueda más la holgura, devuelve el hueco; si no, `null`.
 */
export function forkGap(grid: PlatformGrid, x: number, z: number, halfWidth = WHEEL_HALF_WIDTH): ForkGap | null {
  if (hasCellAt(grid, x, z)) return null;
  const step = grid.cell / 2;
  let left: number | null = null;
  let right: number | null = null;
  for (let d = step; d <= FORK_SCAN_REACH && left === null; d += step) {
    if (hasCellAt(grid, x - d, z)) left = grid.x0 + Math.round((x - d - grid.x0) / grid.cell) * grid.cell + grid.cell / 2;
  }
  for (let d = step; d <= FORK_SCAN_REACH && right === null; d += step) {
    if (hasCellAt(grid, x + d, z)) right = grid.x0 + Math.round((x + d - grid.x0) / grid.cell) * grid.cell - grid.cell / 2;
  }
  if (left === null || right === null) return null;
  const width = right - left;
  const min = 2 * halfWidth + 2 * FORK_SIDE_CLEARANCE;
  if (width < min || width > 2 * halfWidth + 0.8) return null;
  return { left, right, width, centerX: (left + right) / 2 };
}

/** Muesca de horquilla desde un borde: ancho para que la rueda gire y largo para alojarla entera. */
export function forkNotchAt(grid: PlatformGrid, edge: 'front' | 'back' | 'left' | 'right' = 'front', halfWidth = WHEEL_HALF_WIDTH): Pt[] {
  return notchAt(grid, edge, forkGapWidth(halfWidth), 2 * WHEEL_RADIUS * 0.85);
}

/** Cortes predefinidos editables con puntos: muesca en U desde un borde. */
export function notchAt(grid: PlatformGrid, edge: 'front' | 'back' | 'left' | 'right', width = 0.36, depth = 0.16): Pt[] {
  const b = gridBounds(grid);
  const m = 0.08;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const hw = width / 2;
  switch (edge) {
    case 'front': return [{ x: cx - hw, z: b.maxZ + m }, { x: cx - hw, z: b.maxZ - depth }, { x: cx + hw, z: b.maxZ - depth }, { x: cx + hw, z: b.maxZ + m }];
    case 'back': return [{ x: cx - hw, z: b.minZ - m }, { x: cx + hw, z: b.minZ - m }, { x: cx + hw, z: b.minZ + depth }, { x: cx - hw, z: b.minZ + depth }];
    case 'left': return [{ x: b.minX - m, z: cz - hw }, { x: b.minX + depth, z: cz - hw }, { x: b.minX + depth, z: cz + hw }, { x: b.minX - m, z: cz + hw }];
    case 'right': return [{ x: b.maxX + m, z: cz - hw }, { x: b.maxX + m, z: cz + hw }, { x: b.maxX - depth, z: cz + hw }, { x: b.maxX - depth, z: cz - hw }];
  }
}
