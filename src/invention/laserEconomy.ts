import { PLATFORM_CELL, type Rect } from './platformShape';

export const INITIAL_SCRAP = 120;
export const MAX_SCRAP = 240;

export interface LaserEconomyState {
  scrap: number;
  fabricatedCount: number;
  recycledTotal: number;
}

let state: LaserEconomyState = {
  scrap: INITIAL_SCRAP,
  fabricatedCount: 0,
  recycledTotal: 0,
};

const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Costo en chatarra de chapa para fabricar una plataforma según su área real (m²). */
export function fabricateCost(rects: readonly Rect[]): number {
  let area = 0;
  for (const r of rects) area += 4 * r.hx * r.hz;
  return Math.max(10, Math.round(area * 35));
}

/** Chatarra recuperada al recortar celdas de una plataforma. */
export function cutRefund(removedCells: number, cellSize = PLATFORM_CELL): number {
  if (removedCells <= 0) return 0;
  return Math.round(removedCells * cellSize * cellSize * 25);
}

export const laserEconomy = {
  get(): LaserEconomyState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  canAfford(cost: number, unlimited = false): boolean {
    return unlimited || state.scrap >= Math.max(0, cost);
  },
  consume(cost: number, unlimited = false): boolean {
    const amount = Math.max(0, Math.round(cost));
    if (!unlimited && state.scrap < amount) return false;
    state = {
      ...state,
      scrap: unlimited ? state.scrap : Math.max(0, state.scrap - amount),
      fabricatedCount: state.fabricatedCount + 1,
    };
    emit();
    return true;
  },
  addScrap(amount: number): number {
    const gain = Math.max(0, Math.round(amount));
    if (gain === 0) return state.scrap;
    const next = Math.min(MAX_SCRAP, state.scrap + gain);
    state = {
      ...state,
      scrap: next,
      recycledTotal: state.recycledTotal + gain,
    };
    emit();
    return next;
  },
  reset(initial = INITIAL_SCRAP) {
    state = {
      scrap: Math.max(0, Math.min(MAX_SCRAP, Math.round(initial))),
      fabricatedCount: 0,
      recycledTotal: 0,
    };
    emit();
  },
};
