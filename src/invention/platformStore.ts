import {
  clonePoints,
  gridArea,
  gridToRects,
  rasterize,
  PLATFORM_DENSITY,
  type PlatformGrid,
  type PlatformTemplate,
  type Pt,
  type Rect,
} from './platformShape';

/** Datos que hacen falta para volver a soldar una pieza que un corte soltó (Deshacer). */
export interface ReleasedPart {
  id: string;
  parentId: string;
  type: string;
  parentType: string;
  /** Pose relativa a la pieza madre al momento del corte. */
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  axis?: { x: number; y: number; z: number };
}

interface CutHistoryEntry {
  grid: PlatformGrid;
  released: ReleasedPart[];
}

export interface PlatformRecord {
  id: string;
  template: PlatformTemplate;
  outline: Pt[];
  grid: PlatformGrid;
  rects: Rect[];
  mass: number;
  version: number;
  cuts: CutHistoryEntry[];
}

type Listener = () => void;

const platforms = new Map<string, PlatformRecord>();
const listeners = new Set<Listener>();
const rebuildListeners = new Set<(id: string) => void>();
let nonce = 0;

function emit() {
  nonce++;
  for (const l of listeners) l();
}

function withGrid(record: PlatformRecord, grid: PlatformGrid) {
  record.grid = grid;
  record.rects = gridToRects(grid);
  record.mass = Math.max(1.5, gridArea(grid) * PLATFORM_DENSITY);
  record.version++;
}

export const platformStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getNonce() {
    return nonce;
  },
  /** Avisado cuando cambia la forma física de una plataforma (para reaplicar grupos de colisión). */
  onRebuilt(listener: (id: string) => void) {
    rebuildListeners.add(listener);
    return () => { rebuildListeners.delete(listener); };
  },
  notifyRebuilt(id: string) {
    for (const l of rebuildListeners) l(id);
  },
  create(id: string, template: PlatformTemplate, outline: readonly Pt[]): PlatformRecord {
    const record: PlatformRecord = {
      id, template, outline: clonePoints(outline), grid: rasterize(outline), rects: [], mass: 0, version: 0, cuts: [],
    };
    withGrid(record, record.grid);
    platforms.set(id, record);
    emit();
    return record;
  },
  get(id: string): PlatformRecord | undefined {
    return platforms.get(id);
  },
  ids(): string[] {
    return Array.from(platforms.keys());
  },
  applyCut(id: string, grid: PlatformGrid, released: ReleasedPart[]) {
    const record = platforms.get(id);
    if (!record) return;
    record.cuts.push({ grid: record.grid, released });
    withGrid(record, grid);
    emit();
  },
  /** Vuelve a la forma anterior al último corte y devuelve las piezas que hay que resoldar. */
  undoCut(id: string): ReleasedPart[] | null {
    const record = platforms.get(id);
    const last = record?.cuts.pop();
    if (!record || !last) return null;
    withGrid(record, last.grid);
    emit();
    return last.released;
  },
  canUndo(id: string) {
    return (platforms.get(id)?.cuts.length ?? 0) > 0;
  },
  remove(id: string) {
    if (platforms.delete(id)) emit();
  },
  reset() {
    platforms.clear();
    emit();
  },
};
