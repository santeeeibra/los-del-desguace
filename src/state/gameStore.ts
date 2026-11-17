import { useSyncExternalStore } from 'react';
import type { QualityLevel } from '../config/visualConfig';
import type { GrabbableKind } from '../props/grabbableRegistry';

export type TouchOverlayMode = 'auto' | 'on' | 'off';
export type CameraViewMode = 'firstPerson' | 'thirdPersonClose' | 'thirdPersonWide';

export const CAMERA_VIEW_ORDER: readonly CameraViewMode[] = [
  'firstPerson',
  'thirdPersonClose',
  'thirdPersonWide',
];

export const CAMERA_VIEW_LABELS: Record<CameraViewMode, { short: string; label: string }> = {
  firstPerson: { short: '1ªP', label: 'Primera persona' },
  thirdPersonClose: { short: '3ª Cerca', label: 'Tercera cercana' },
  thirdPersonWide: { short: '3ª Amplia', label: 'Tercera amplia' },
};

const CAMERA_STORAGE_KEY = 'los-del-desguace.camera.v1';

function loadSavedCameraMode(): CameraViewMode {
  if (typeof window === 'undefined') return 'firstPerson';
  try {
    const raw = window.localStorage.getItem(CAMERA_STORAGE_KEY);
    if (raw === 'firstPerson' || raw === 'thirdPersonClose' || raw === 'thirdPersonWide') {
      return raw;
    }
  } catch {
    // Ignore storage unavailability
  }
  return 'firstPerson';
}

function saveCameraMode(mode: CameraViewMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

export interface GameHudState {
  quality: QualityLevel;
  touchMode: TouchOverlayMode;
  isTouchDevice: boolean;
  cameraMode: CameraViewMode;
  cameraBanner: string | null;
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
  cameraMode: loadSavedCameraMode(),
  cameraBanner: null,
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
let cameraBannerClearTimer: number | null = null;

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
  setCameraMode(cameraMode: CameraViewMode, announce = true) {
    if (state.cameraMode === cameraMode) return;
    saveCameraMode(cameraMode);
    if (cameraBannerClearTimer !== null) {
      window.clearTimeout(cameraBannerClearTimer);
      cameraBannerClearTimer = null;
    }
    state = {
      ...state,
      cameraMode,
      cameraBanner: announce ? CAMERA_VIEW_LABELS[cameraMode].label : state.cameraBanner,
    };
    emit();
    if (announce) {
      cameraBannerClearTimer = window.setTimeout(() => {
        cameraBannerClearTimer = null;
        state = { ...state, cameraBanner: null };
        emit();
      }, 1600);
    }
  },
  cycleCameraMode() {
    const idx = CAMERA_VIEW_ORDER.indexOf(state.cameraMode);
    const next = CAMERA_VIEW_ORDER[(idx + 1) % CAMERA_VIEW_ORDER.length];
    this.setCameraMode(next, true);
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
