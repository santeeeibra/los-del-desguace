/**
 * Cortar en escena: estado del modo de corte directo sobre una plataforma (Taller Libre).
 * Reutiliza la lógica de la Mesa de Corte (cutFromEdge, apoyo de uniones, espacio de giro).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { laserTableBridge, type PlatformInfo } from './laserTableBridge';
import { grabbableRegistry } from '../props/grabbableRegistry';
import { platformStore } from './platformStore';
import {
  cellCenter,
  cutFromEdge,
  emptyGrid,
  forkNotchAt,
  gridToRects,
  notchAt,
  type PlatformGrid,
  type Pt,
  type Rect,
} from './platformShape';
import { unsupportedAfterCut } from './platformRules';

export type CutPhase = 'edit' | 'cutting';

export interface SceneCutState {
  active: boolean;
  platformId: string | null;
  points: Pt[];
  sweepWheel: string | null;
  phase: CutPhase;
  /** Se pidió cortar con piezas que quedan sin apoyo: el próximo Cortar confirma. */
  confirmLoose: boolean;
  message: string | null;
  /** Rumbo de la cámara de corte alrededor de la pieza (radianes). */
  viewYaw: number;
  /** Se incrementa al terminar cada corte (para el desprendimiento del sobrante). */
  cutNonce: number;
  lastCut: { platformId: string; removed: Rect[] } | null;
}

let state: SceneCutState = {
  active: false, platformId: null, points: [], sweepWheel: null, phase: 'edit', confirmLoose: false,
  message: null, viewYaw: 0, cutNonce: 0, lastCut: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<SceneCutState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const SNAP = 0.01;
const snap = (p: Pt): Pt => ({ x: Math.round(p.x / SNAP) * SNAP, z: Math.round(p.z / SNAP) * SNAP });

export const sceneCutStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
  isActive: () => state.active,
  start(platformId: string) {
    const prepared = laserTableBridge.get()?.prepareSceneCut(platformId);
    if (!prepared) return 'El taller no está listo';
    if (prepared.error) return prepared.error;
    const viewYaw = prepared.viewYaw ?? 0;
    set({ active: true, platformId, points: [], sweepWheel: null, phase: 'edit', confirmLoose: false,
      message: null, viewYaw });
    return null;
  },
  stop() { set({ active: false, platformId: null, points: [], phase: 'edit', confirmLoose: false, message: null }); },
  addPoint(p: Pt) { if (state.phase === 'edit') set({ points: [...state.points, snap(p)], confirmLoose: false }); },
  movePoint(index: number, p: Pt) {
    if (state.phase !== 'edit' || !state.points[index]) return;
    const points = state.points.slice();
    points[index] = snap(p);
    set({ points, confirmLoose: false });
  },
  removeLast() { if (state.phase === 'edit') set({ points: state.points.slice(0, -1), confirmLoose: false }); },
  clear() { if (state.phase === 'edit') set({ points: [], confirmLoose: false }); },
  /**
   * Pone un recorte listo en el borde: muesca en U (`u`) o hueco de horquilla para una rueda (`fork`).
   * Se puede ajustar arrastrando los puntos antes de cortar.
   */
  notch(kind: 'u' | 'fork', edge: 'front' | 'back' | 'left' | 'right' = 'front') {
    const id = state.platformId;
    const record = id ? platformStore.get(id) : undefined;
    if (!record || state.phase !== 'edit') return;
    const points = (kind === 'fork' ? forkNotchAt(record.grid, edge) : notchAt(record.grid, edge)).map(snap);
    set({ points, confirmLoose: false, message: null });
  },
  setSweepWheel(id: string | null) { set({ sweepWheel: id }); },
  /** Posiciones de las piezas soldadas a la pieza en corte (para encuadrar la cámara). */
  framingPoints(): { x: number; y: number; z: number }[] {
    const id = state.platformId;
    const info = id ? laserTableBridge.get()?.info(id) : null;
    if (!info) return [];
    const out: { x: number; y: number; z: number }[] = [];
    for (const child of info.children) {
      const t = grabbableRegistry.getById(child.id)?.getBody()?.translation();
      if (t) out.push(t);
    }
    return out;
  },
  orbit(delta: number) { set({ viewYaw: state.viewYaw + delta }); },
  setMessage(message: string | null) { set({ message }); },
  /** Pide cortar: si quedan piezas sin apoyo, la primera vez solo avisa. */
  requestCut(preview: CutPreview | null, looseNames: string[]) {
    if (!preview || preview.error || state.phase !== 'edit') return;
    if (preview.loose.length && !state.confirmLoose) {
      set({ confirmLoose: true, message: `Se soltará ${looseNames.join(', ')}. Tocá Cortar otra vez para confirmar.` });
      return;
    }
    set({ phase: 'cutting', message: 'Cortando…' });
  },
  /** Lo llama la escena cuando el láser terminó de recorrer la línea. */
  finishCut() {
    const id = state.platformId;
    if (!id || state.phase !== 'cutting') return;
    const record = platformStore.get(id);
    const polygon = state.points;
    const before = record ? cutFromEdge(record.grid, polygon) : null;
    if (!record || !before || before.error) {
      set({ phase: 'edit', message: before?.error ?? 'No se pudo cortar', confirmLoose: false });
      return;
    }
    const removed = gridToRects(cellsGrid(record.grid, before.removed));
    const result = laserTableBridge.get()?.cut(id, polygon);
    if (!result || result.error) {
      set({ phase: 'edit', message: result?.error ?? 'No se pudo cortar', confirmLoose: false });
      return;
    }
    set({
      phase: 'edit', points: [], confirmLoose: false, cutNonce: state.cutNonce + 1,
      lastCut: { platformId: id, removed },
      message: result?.released?.length ? `Corte hecho · se soltaron ${result.released.length} pieza(s)` : 'Corte hecho',
    });
  },
  undo() {
    const id = state.platformId;
    if (!id || state.phase !== 'edit') return;
    const result = laserTableBridge.get()?.undo(id);
    set({ message: result?.error ?? `Corte deshecho${result?.restored ? ` · ${result.restored} pieza(s) resoldada(s)` : ''}` });
  },
};

export function useSceneCut() {
  return useSyncExternalStore(sceneCutStore.subscribe, sceneCutStore.get);
}

export function cellsGrid(base: PlatformGrid, cells: Iterable<number>): PlatformGrid {
  const grid = { ...emptyGrid(), cell: base.cell, x0: base.x0, z0: base.z0, nx: base.nx, nz: base.nz };
  grid.data = new Uint8Array(base.data.length);
  for (const idx of cells) grid.data[idx] = 1;
  return grid;
}

function materialAt(grid: PlatformGrid, p: Pt) {
  const i = Math.round((p.x - grid.x0) / grid.cell);
  const k = Math.round((p.z - grid.z0) / grid.cell);
  if (i < 0 || k < 0 || i >= grid.nx || k >= grid.nz) return false;
  return grid.data[k * grid.nx + i] === 1;
}

/** Segmentos del borde de la chapa (para dibujar el contorno celeste de lo que queda). */
export function outlineSegments(grid: PlatformGrid): number[] {
  const out: number[] = [];
  const h = grid.cell / 2;
  const at = (i: number, k: number) => i >= 0 && k >= 0 && i < grid.nx && k < grid.nz && grid.data[k * grid.nx + i] === 1;
  for (let k = 0; k < grid.nz; k++) {
    for (let i = 0; i < grid.nx; i++) {
      if (!at(i, k)) continue;
      const c = cellCenter(grid, i, k);
      if (!at(i + 1, k)) out.push(c.x + h, c.z - h, c.x + h, c.z + h);
      if (!at(i - 1, k)) out.push(c.x - h, c.z - h, c.x - h, c.z + h);
      if (!at(i, k + 1)) out.push(c.x - h, c.z + h, c.x + h, c.z + h);
      if (!at(i, k - 1)) out.push(c.x - h, c.z - h, c.x + h, c.z - h);
    }
  }
  return out;
}

export interface CutPreview {
  error: string | null;
  remaining: PlatformGrid;
  removedRects: Rect[];
  loose: string[];
}

/** Vista previa del corte marcado: lo que queda, lo que se quita y qué uniones se sueltan. */
export function computeCutPreview(grid: PlatformGrid, points: readonly Pt[], info: PlatformInfo | null): CutPreview {
  if (points.length < 3) {
    return { error: points.length ? 'Seguí marcando: hacen falta al menos 3 puntos' : null, remaining: grid, removedRects: [], loose: [] };
  }
  if (materialAt(grid, points[0]) || materialAt(grid, points[points.length - 1])) {
    return { error: 'El corte tiene que empezar y terminar afuera del borde', remaining: grid, removedRects: [], loose: [] };
  }
  const result = cutFromEdge(grid, points);
  if (result.error) return { error: result.error, remaining: grid, removedRects: [], loose: [] };
  const loose = info ? unsupportedAfterCut(grid, result.grid, info.children) : [];
  return { error: null, remaining: result.grid, removedRects: gridToRects(cellsGrid(grid, result.removed)), loose };
}

/** Datos vivos de la pieza en corte (piezas soldadas, dirección) + vista previa. */
export function useCutPreview() {
  const cut = useSceneCut();
  const nonce = useSyncExternalStore(platformStore.subscribe, platformStore.getNonce);
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  useEffect(() => {
    if (!cut.active || !cut.platformId) { setInfo(null); return; }
    const id = cut.platformId;
    const read = () => setInfo(laserTableBridge.get()?.info(id) ?? null);
    read();
    const timer = window.setInterval(read, 300);
    return () => window.clearInterval(timer);
  }, [cut.active, cut.platformId, nonce]);
  const record = cut.platformId ? platformStore.get(cut.platformId) : undefined;
  const childKey = info?.children.map((c) => `${c.id}:${c.pose.position.x.toFixed(2)},${c.pose.position.z.toFixed(2)}`).join('|') ?? '';
  const preview = useMemo(
    () => (record ? computeCutPreview(record.grid, cut.points, info) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [record?.version, record, cut.points, childKey],
  );
  return { cut, info, record, preview };
}
