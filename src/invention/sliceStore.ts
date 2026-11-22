/** Estado de la herramienta de rebanar: pieza elegida, orientación del plano y desplazamiento. */
import { useSyncExternalStore } from 'react';

export type SliceMode = 'horizontal' | 'right' | 'forward';
type Vec = { x: number; y: number; z: number };

export interface SliceState {
  active: boolean;
  targetId: string | null;
  label: string;
  /** Radio que abarca la pieza (límite del deslizador). */
  radius: number;
  mode: SliceMode;
  /** Distancia del plano al centro de la pieza, en metros (con signo). */
  offset: number;
  right: Vec;
  forward: Vec;
  message: string | null;
}

const IDLE: SliceState = {
  active: false, targetId: null, label: '', radius: 0.5, mode: 'horizontal', offset: 0,
  right: { x: 1, y: 0, z: 0 }, forward: { x: 0, y: 0, z: 1 }, message: null,
};

let state: SliceState = IDLE;
const listeners = new Set<() => void>();
function set(patch: Partial<SliceState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export const sliceStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getState() { return state; },
  isActive() { return state.active; },
  start(init: { id: string; label: string; radius: number; right: Vec; forward: Vec }) {
    set({ ...IDLE, active: true, targetId: init.id, label: init.label, radius: init.radius, right: init.right, forward: init.forward });
  },
  stop() { set({ ...IDLE }); },
  setMode(mode: SliceMode) { set({ mode, offset: 0, message: null }); },
  setOffset(offset: number) {
    const limit = state.radius * 0.9;
    set({ offset: Math.max(-limit, Math.min(limit, offset)), message: null });
  },
  setMessage(message: string | null) { set({ message }); },
  /** Normal del plano en el mundo según el modo elegido. */
  normal(): Vec {
    if (state.mode === 'right') return state.right;
    if (state.mode === 'forward') return state.forward;
    return { x: 0, y: 1, z: 0 };
  },
};

export function useSlice() {
  return useSyncExternalStore(sliceStore.subscribe, sliceStore.getState);
}
