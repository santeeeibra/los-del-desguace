import { useSyncExternalStore } from 'react';
import type { QualityLevel } from '../config/visualConfig';
import type { GrabbableKind } from '../props/grabbableRegistry';

export type TouchOverlayMode = 'auto' | 'on' | 'off';

export interface GameHudState {
  quality: QualityLevel;
  touchMode: TouchOverlayMode;
  isTouchDevice: boolean;
  nearbyTargetId: string | null;
  nearbyTargetKind: GrabbableKind | null;
  carriedId: string | null;
  carriedKind: GrabbableKind | null;
  impactFeedback: 'land' | 'bump' | null;
  impactNonce: number;
  dropBlockedHint: boolean;
  resetNonce: number;
  showHelp: boolean;
  sceneReady: boolean;
}

const initialIsTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 820);

let state: GameHudState = {
  quality: 'high',
  touchMode: 'auto',
  isTouchDevice: initialIsTouch,
  nearbyTargetId: null,
  nearbyTargetKind: null,
  carriedId: null,
  carriedKind: null,
  impactFeedback: null,
  impactNonce: 0,
  dropBlockedHint: false,
  resetNonce: 0,
  showHelp: true,
  sceneReady: false,
};

const listeners = new Set<() => void>();

let impactClearTimer: number | null = null;
let dropHintClearTimer: number | null = null;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export const gameStore = {
  getState(): GameHudState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setQuality(quality: QualityLevel) {
    if (state.quality === quality) return;
    state = { ...state, quality };
    emit();
  },
  setTouchMode(touchMode: TouchOverlayMode) {
    if (state.touchMode === touchMode) return;
    state = { ...state, touchMode };
    emit();
  },
  setNearbyTarget(id: string | null, kind: GameHudState['nearbyTargetKind']) {
    if (state.nearbyTargetId === id && state.nearbyTargetKind === kind) return;
    state = { ...state, nearbyTargetId: id, nearbyTargetKind: kind };
    emit();
  },
  setCarried(id: string | null, kind: GameHudState['carriedKind']) {
    if (state.carriedId === id && state.carriedKind === kind) return;
    state = { ...state, carriedId: id, carriedKind: kind };
    emit();
  },
  triggerImpact(kind: 'land' | 'bump') {
    if (impactClearTimer !== null) {
      window.clearTimeout(impactClearTimer);
    }
    state = { ...state, impactFeedback: kind, impactNonce: state.impactNonce + 1 };
    emit();
    impactClearTimer = window.setTimeout(() => {
      impactClearTimer = null;
      state = { ...state, impactFeedback: null };
      emit();
    }, 550);
  },
  triggerDropBlocked() {
    if (dropHintClearTimer !== null) {
      window.clearTimeout(dropHintClearTimer);
    }
    state = { ...state, dropBlockedHint: true };
    emit();
    dropHintClearTimer = window.setTimeout(() => {
      dropHintClearTimer = null;
      state = { ...state, dropBlockedHint: false };
      emit();
    }, 1400);
  },
  triggerReset() {
    state = { ...state, resetNonce: state.resetNonce + 1 };
    emit();
  },
  toggleHelp() {
    state = { ...state, showHelp: !state.showHelp };
    emit();
  },
  setSceneReady(ready: boolean) {
    if (state.sceneReady === ready) return;
    state = { ...state, sceneReady: ready };
    emit();
  },
};

export function useGameStore<T>(selector: (s: GameHudState) => T): T {
  return useSyncExternalStore(
    gameStore.subscribe,
    () => selector(gameStore.getState()),
    () => selector(gameStore.getState())
  );
}
