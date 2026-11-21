import { useSyncExternalStore } from 'react';
import { extraPartPosition } from '../environment/workshopLayout';
import { playImpact } from '../audio/sfxEngine';
import { buildToolsLocked } from '../modes/gameModes';
import {
  EMOTE_BY_ID,
  loadCharacterCustomization,
  saveCharacterCustomization,
  type CharacterCustomizationConfig,
  type EmoteId,
} from '../character/characterCustomization';
import { listBlueprints, type ContraptionBlueprint } from '../logic/blueprintManager';
import type { QualityLevel } from '../config/visualConfig';
import { WRENCH_AXES, type WrenchAxis } from '../invention/wrenchRotation';
import type { StarterBuildStep } from '../invention/workshopAssembly';
import type { GrabbableKind } from '../props/grabbableRegistry';
import { emptyInventory, INVENTORY_SIZE, placeInInventory, type InventoryItem, type InventorySlots } from './inventory';

export type TouchOverlayMode = 'auto' | 'on' | 'off';
export type CameraViewMode = 'firstPerson' | 'thirdPersonClose' | 'thirdPersonWide';
export type MouseLookMode = 'pointerLock' | 'drag';

const MOUSE_LOOK_STORAGE_KEY = 'los-del-desguace.mouselook.v1';
const TOWER_NUT_STORAGE_KEY = 'los-del-desguace.mirador-nut.v1';

function loadTowerNut(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TOWER_NUT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadSavedMouseLookMode(): MouseLookMode {
  if (typeof window === 'undefined') return 'pointerLock';
  try {
    const raw = window.localStorage.getItem(MOUSE_LOOK_STORAGE_KEY);
    if (raw === 'pointerLock' || raw === 'drag') return raw;
  } catch {
    // Ignore storage unavailability
  }
  return 'pointerLock';
}

function saveMouseLookMode(mode: MouseLookMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOUSE_LOOK_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

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

export interface SpawnedPropEntry {
  id: string;
  kind: GrabbableKind;
  position: [number, number, number];
  spawnIndex: number;
}

export const MAX_EXTRA_PROPS = 24;

export interface GameHudState {
  blueprints: ContraptionBlueprint[];
  towerNutFound: boolean;
  quality: QualityLevel;
  touchMode: TouchOverlayMode;
  isTouchDevice: boolean;
  mouseLookMode: MouseLookMode;
  pointerLocked: boolean;
  cameraMode: CameraViewMode;
  cameraBanner: string | null;
  nearbyTargetId: string | null;
  nearbyTargetKind: GrabbableKind | null;
  nearbyTargetMounted: boolean;
  nearbyTargetRideable: boolean;
  workshopSlot: string | null;
  aimedWorkshopSlot: string | null;
  laserHint: string | null;
  wireHint: string | null;
  starterBuildStep: StarterBuildStep;
  celebration: { title: string; detail?: string; kind: 'workshop' | 'achievement'; id: number } | null;
  pendingWireFrom: string | null;
  wiringActive: boolean;
  testBench: { power: number; rpm: number } | null;
  laserPlacementReady: boolean;
  partMountReady: boolean;
  workshopStatus: string | null;
  cartMode: 'fixed' | 'free' | null;
  assemblyInteraction: 'release' | 'lift' | 'push' | 'heavy' | 'drop' | 'position' | 'place' | null;
  activeStationType: 'cart' | 'custom' | null;
  canUndoMount: boolean;
  seated: boolean;
  seatedFlightMode: boolean;
  wrenchEquipped: boolean;
  /** Soldadora equipada (implica el rayo láser de la llave). */
  welderEquipped: boolean;
  /** Avance (0–1) de la soldadura que se está haciendo con la soldadora. */
  weldProgress: number;
  wrenchAiming: boolean;
  wrenchAimLocked: boolean;
  wrenchAxis: WrenchAxis;
  wrenchTarget: 'piece' | 'base' | null;
  rotatingTargetId: string | null;
  carriedId: string | null;
  carriedKind: GrabbableKind | null;
  inventorySlots: InventorySlots;
  inventorySelection: number;
  activeGuideIndex: number;
  spawnedProps: SpawnedPropEntry[];
  characterConfig: CharacterCustomizationConfig;
  activeEmote: EmoteId | null;
  activeEmoteNonce: number;
  impactFeedback: 'land' | 'bump' | null;
  impactNonce: number;
  dropBlockedHint: 'drop' | 'mount' | 'rotate' | 'move' | 'inventory' | 'laser' | 'wired' | null;
  resetNonce: number;
  showHelp: boolean;
  sceneReady: boolean;
}

const initialIsTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 820);

function starterInventory(): InventorySlots {
  const slots = [...emptyInventory()];
  slots[INVENTORY_SIZE - 1] = {
    id: 'guide-blueprint',
    kind: 'blueprint',
    rotation: [0, 0, 0, 1],
  };
  return slots;
}

let state: GameHudState = {
  blueprints: listBlueprints(),
  towerNutFound: loadTowerNut(),
  quality: 'high',
  touchMode: 'auto',
  isTouchDevice: initialIsTouch,
  mouseLookMode: loadSavedMouseLookMode(),
  pointerLocked: false,
  cameraMode: loadSavedCameraMode(),
  cameraBanner: null,
  nearbyTargetId: null,
  nearbyTargetKind: null,
  nearbyTargetMounted: false,
  nearbyTargetRideable: false,
  workshopSlot: null,
  aimedWorkshopSlot: null,
  laserHint: null,
  wireHint: null,
  starterBuildStep: 'wheels',
  celebration: null,
  pendingWireFrom: null,
  wiringActive: false,
  testBench: null,
  laserPlacementReady: false,
  partMountReady: false,
  workshopStatus: null,
  cartMode: null,
  assemblyInteraction: null,
  activeStationType: null,
  canUndoMount: false,
  seated: false,
  seatedFlightMode: false,
  wrenchEquipped: false,
  welderEquipped: false,
  weldProgress: 0,
  wrenchAiming: false,
  wrenchAimLocked: false,
  wrenchAxis: 'vertical',
  wrenchTarget: null,
  rotatingTargetId: null,
  carriedId: null,
  carriedKind: null,
  inventorySlots: starterInventory(),
  inventorySelection: 0,
  activeGuideIndex: 0,
  spawnedProps: [],
  characterConfig: loadCharacterCustomization(),
  activeEmote: null,
  activeEmoteNonce: 0,
  impactFeedback: null,
  impactNonce: 0,
  dropBlockedHint: null,
  resetNonce: 0,
  showHelp: true,
  sceneReady: false,
};

const listeners = new Set<() => void>();

let impactClearTimer: number | null = null;
let dropHintClearTimer: number | null = null;
let cameraBannerClearTimer: number | null = null;
let wireHintClearTimer: number | null = null;
let celebrationTimer: ReturnType<typeof setTimeout> | undefined;
let celebrationId = 0;
let emoteClearTimer: ReturnType<typeof setTimeout> | null = null;
let clearExtraPartsRequested = false;
let previousInventorySelection = 0;
let nextExtraPartId = 0;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export const gameStore = {
  collectTowerNut() {
    if (state.towerNutFound) return false;
    state = { ...state, towerNutFound: true };
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(TOWER_NUT_STORAGE_KEY, '1');
      } catch {
        // Keep the reward for this session if storage is unavailable.
      }
    }
    emit();
    return true;
  },
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
  setMouseLookMode(mouseLookMode: MouseLookMode) {
    if (state.mouseLookMode === mouseLookMode) return;
    saveMouseLookMode(mouseLookMode);
    if (mouseLookMode === 'drag' && typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    state = { ...state, mouseLookMode };
    emit();
  },
  setPointerLocked(pointerLocked: boolean) {
    if (state.pointerLocked === pointerLocked) return;
    state = { ...state, pointerLocked };
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
  setNearbyTarget(id: string | null, kind: GameHudState['nearbyTargetKind'], mounted = false, rideable = false) {
    if (
      state.nearbyTargetId === id &&
      state.nearbyTargetKind === kind &&
      state.nearbyTargetMounted === mounted &&
      state.nearbyTargetRideable === rideable
    ) return;
    state = { ...state, nearbyTargetId: id, nearbyTargetKind: kind, nearbyTargetMounted: mounted, nearbyTargetRideable: rideable };
    emit();
  },
  setWorkshopSlot(workshopSlot: GameHudState['workshopSlot']) {
    if (state.workshopSlot === workshopSlot) return;
    state = { ...state, workshopSlot };
    emit();
  },
  refreshBlueprints() {
    state = { ...state, blueprints: listBlueprints() };
    emit();
  },
  setSeated(seated: boolean, flightMode = false) {
    if (state.seated === seated && (!seated || state.seatedFlightMode === flightMode)) return;
    state = seated ? {
      ...state,
      seated,
      seatedFlightMode: flightMode,
      nearbyTargetId: null,
      nearbyTargetKind: null,
      nearbyTargetMounted: false,
      nearbyTargetRideable: false,
      workshopSlot: null,
      aimedWorkshopSlot: null,
      laserHint: null,
      laserPlacementReady: false,
      partMountReady: false,
      wrenchAiming: false,
      wrenchAimLocked: false,
      wrenchTarget: null,
      cartMode: null,
      activeStationType: null,
      workshopStatus: null,
    } : { ...state, seated, seatedFlightMode: false };
    emit();
  },
  setLaserInteraction(aimedWorkshopSlot: string | null, laserHint: string | null, laserPlacementReady: boolean, partMountReady = false) {
    if (state.aimedWorkshopSlot === aimedWorkshopSlot && state.laserHint === laserHint &&
      state.laserPlacementReady === laserPlacementReady && state.partMountReady === partMountReady) return;
    state = { ...state, aimedWorkshopSlot, laserHint, laserPlacementReady, partMountReady };
    emit();
  },
  setStarterBuildStep(starterBuildStep: StarterBuildStep) {
    if (state.starterBuildStep === starterBuildStep) return;
    state = { ...state, starterBuildStep };
    emit();
  },
  celebrate(title: string, detail?: string, kind: 'workshop' | 'achievement' = 'workshop') {
    const current = state.celebration;
    if (kind === 'workshop' && current?.kind === 'achievement') return;
    if (current?.title === title && current.detail === detail) return;
    clearTimeout(celebrationTimer);
    state = { ...state, celebration: { title, detail, kind, id: ++celebrationId } };
    emit();
    celebrationTimer = setTimeout(() => {
      celebrationTimer = undefined;
      state = { ...state, celebration: null };
      emit();
    }, kind === 'achievement' ? 3100 : 1900);
  },
  setWireHint(wireHint: string | null) {
    if (wireHintClearTimer !== null) {
      window.clearTimeout(wireHintClearTimer);
      wireHintClearTimer = null;
    }
    if (state.wireHint !== wireHint) {
      state = { ...state, wireHint };
      emit();
    }
    if (wireHint !== null) {
      wireHintClearTimer = window.setTimeout(() => {
        wireHintClearTimer = null;
        state = { ...state, wireHint: null };
        emit();
      }, 2600);
    }
  },
  setPendingWireFrom(pendingWireFrom: string | null) {
    const wiringActive = pendingWireFrom !== null;
    if (state.pendingWireFrom === pendingWireFrom && state.wiringActive === wiringActive) return;
    state = { ...state, pendingWireFrom, wiringActive };
    emit();
  },
  beginWiring() {
    if (state.wiringActive) return;
    state = { ...state, wiringActive: true };
    emit();
  },
  setTestBench(open: boolean) {
    if (Boolean(state.testBench) === open) return;
    state = { ...state, testBench: open ? { power: 0, rpm: 0 } : null };
    emit();
  },
  setBenchPower(power: number) {
    if (!state.testBench || !Number.isFinite(power)) return;
    state = { ...state, testBench: { ...state.testBench, power: Math.min(1, Math.max(0, power)) } };
    emit();
  },
  setBenchRpm(rpm: number) {
    if (!state.testBench || state.testBench.rpm === rpm) return;
    state = { ...state, testBench: { ...state.testBench, rpm } };
    emit();
  },
  triggerRotatingTarget(id: string) {
    state = { ...state, rotatingTargetId: id };
    emit();
    window.setTimeout(() => {
      if (state.rotatingTargetId === id) {
        state = { ...state, rotatingTargetId: null };
        emit();
      }
    }, 900);
  },
  setWorkshopStatus(workshopStatus: string | null) {
    if (state.workshopStatus === workshopStatus) return;
    state = { ...state, workshopStatus };
    emit();
  },
  setCartMode(cartMode: GameHudState['cartMode'], stationType: GameHudState['activeStationType'] = null) {
    const nextStationType = cartMode ? (stationType ?? 'cart') : null;
    if (state.cartMode === cartMode && state.activeStationType === nextStationType) return;
    state = { ...state, cartMode, activeStationType: nextStationType };
    emit();
  },
  setAssemblyInteraction(assemblyInteraction: GameHudState['assemblyInteraction']) {
    if (state.assemblyInteraction === assemblyInteraction) return;
    state = { ...state, assemblyInteraction };
    emit();
  },
  setCanUndoMount(canUndoMount: boolean) {
    if (state.canUndoMount === canUndoMount) return;
    state = { ...state, canUndoMount };
    emit();
  },
  toggleWrench() {
    // Bloqueada en modos de armado por slots, salvo para guardarla si quedó en la mano.
    if (buildToolsLocked() && !state.wrenchEquipped) return;
    if (wireHintClearTimer !== null) {
      window.clearTimeout(wireHintClearTimer);
      wireHintClearTimer = null;
    }
    state = {
      ...state, wrenchEquipped: !state.wrenchEquipped, welderEquipped: false, wrenchAiming: false, wrenchAimLocked: false, wrenchTarget: null,
      aimedWorkshopSlot: null, laserHint: null, laserPlacementReady: false, partMountReady: false, wireHint: null, pendingWireFrom: null, wiringActive: false,
    };
    emit();
  },
  /** Equipa o guarda la soldadora (Shift+X). Usa el mismo rayo de apuntado que la llave. */
  toggleWelder() {
    if (buildToolsLocked() && !state.wrenchEquipped) return;
    if (wireHintClearTimer !== null) {
      window.clearTimeout(wireHintClearTimer);
      wireHintClearTimer = null;
    }
    const equip = !state.welderEquipped;
    state = {
      ...state, wrenchEquipped: equip, welderEquipped: equip, wrenchAiming: false, wrenchAimLocked: false, wrenchTarget: null,
      aimedWorkshopSlot: null, laserHint: null, laserPlacementReady: false, partMountReady: false, wireHint: null, pendingWireFrom: null, wiringActive: false,
    };
    emit();
  },
  setWeldProgress(progress: number) {
    const next = Math.max(0, Math.min(1, progress));
    if (Math.abs(state.weldProgress - next) < 0.01 && (next === 0) === (state.weldProgress === 0)) return;
    state = { ...state, weldProgress: next };
    emit();
  },
  toggleWrenchAimLock() {
    if (buildToolsLocked()) return;
    if (!state.wrenchEquipped) {
      state = {
        ...state,
        wrenchEquipped: true,
        wrenchAimLocked: true,
        wrenchAiming: true,
      };
      emit();
      return;
    }
    const nextLocked = !state.wrenchAimLocked;
    state = nextLocked
      ? { ...state, wrenchAimLocked: true, wrenchAiming: true }
      : {
          ...state,
          wrenchAimLocked: false,
          wrenchAiming: false,
          wrenchTarget: null,
          aimedWorkshopSlot: null,
          laserHint: null,
          laserPlacementReady: false,
          partMountReady: false,
        };
    emit();
  },
  setWrenchAiming(aiming: boolean) {
    const wrenchAiming = (aiming || state.wrenchAimLocked) && state.wrenchEquipped;
    if (state.wrenchAiming === wrenchAiming) return;
    state = wrenchAiming
      ? { ...state, wrenchAiming }
      : { ...state, wrenchAiming, wrenchTarget: null, aimedWorkshopSlot: null, laserHint: null, laserPlacementReady: false, partMountReady: false };
    emit();
  },
  cycleWrenchAxis() {
    if (!state.wrenchEquipped || (!state.carriedId && state.wrenchTarget !== 'piece')) return;
    const next = (WRENCH_AXES.indexOf(state.wrenchAxis) + 1) % WRENCH_AXES.length;
    state = { ...state, wrenchAxis: WRENCH_AXES[next] };
    emit();
  },
  setWrenchTarget(wrenchTarget: GameHudState['wrenchTarget']) {
    if (state.wrenchTarget === wrenchTarget) return;
    state = { ...state, wrenchTarget };
    emit();
  },
  setCarried(id: string | null, kind: GameHudState['carriedKind']) {
    if (state.carriedId === id && state.carriedKind === kind) return;
    state = id
      ? { ...state, carriedId: id, carriedKind: kind, pendingWireFrom: null, wiringActive: false }
      : { ...state, carriedId: null, carriedKind: kind };
    emit();
  },
  selectInventory(index: number) {
    if (index < 0 || index >= INVENTORY_SIZE || state.inventorySelection === index) return;
    previousInventorySelection = state.inventorySelection;
    state = { ...state, inventorySelection: index };
    emit();
  },
  selectPreviousInventory() {
    this.selectInventory(previousInventorySelection);
  },
  cycleInventory(direction: number) {
    this.selectInventory((state.inventorySelection + direction + INVENTORY_SIZE) % INVENTORY_SIZE);
  },
  setActiveGuideIndex(activeGuideIndex: number) {
    if (state.activeGuideIndex === activeGuideIndex) return;
    state = { ...state, activeGuideIndex };
    emit();
  },
  storeInventory(item: InventoryItem, index: number, exact = false) {
    const result = placeInInventory(state.inventorySlots, item, index, exact);
    if (!result) return false;
    state = { ...state, inventorySlots: result.slots, inventorySelection: result.index };
    emit();
    return true;
  },
  removeInventory(index: number) {
    if (!state.inventorySlots[index]) return;
    const slots = [...state.inventorySlots];
    slots[index] = null;
    state = { ...state, inventorySlots: slots };
    emit();
  },
  triggerImpact(kind: 'land' | 'bump') {
    playImpact(kind === 'land' ? 0.4 : 0.6);
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
  triggerDropBlocked(reason: NonNullable<GameHudState['dropBlockedHint']> = 'drop') {
    if (dropHintClearTimer !== null) {
      window.clearTimeout(dropHintClearTimer);
    }
    state = { ...state, dropBlockedHint: reason };
    emit();
    dropHintClearTimer = window.setTimeout(() => {
      dropHintClearTimer = null;
      state = { ...state, dropBlockedHint: null };
      emit();
    }, 1400);
  },
  triggerReset() {
    clearExtraPartsRequested = false;
    previousInventorySelection = 0;
    clearTimeout(celebrationTimer);
    celebrationTimer = undefined;
    state = { ...state, resetNonce: state.resetNonce + 1, inventorySlots: starterInventory(), inventorySelection: 0, spawnedProps: [], celebration: null };
    emit();
  },
  spawnExtraPart(kind: GrabbableKind, position?: [number, number, number]): SpawnedPropEntry | null {
    if (state.spawnedProps.length >= MAX_EXTRA_PROPS) return null;
    const occupied = new Set(state.spawnedProps.map(({ spawnIndex }) => spawnIndex));
    let idx = 0;
    while (occupied.has(idx)) idx++;
    const entry: SpawnedPropEntry = {
      id: `extra-${kind}-${++nextExtraPartId}`,
      kind,
      spawnIndex: idx,
      position: position ?? extraPartPosition(idx),
    };
    state = { ...state, spawnedProps: [...state.spawnedProps, entry] };
    emit();
    return entry;
  },
  requestClearExtraParts() {
    clearExtraPartsRequested = true;
  },
  clearExtraParts(canRemove: (entry: SpawnedPropEntry) => boolean) {
    if (!clearExtraPartsRequested) return;
    clearExtraPartsRequested = false;
    const spawnedProps = state.spawnedProps.filter((entry) =>
      state.carriedId === entry.id || state.inventorySlots.some((item) => item?.id === entry.id) || !canRemove(entry)
    );
    if (spawnedProps.length === state.spawnedProps.length) return 0;
    const removed = state.spawnedProps.length - spawnedProps.length;
    state = { ...state, spawnedProps };
    emit();
    return removed;
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
  setCharacterConfig(patch: Partial<CharacterCustomizationConfig>) {
    if (patch.colorPresetId === 'mirador' && !state.towerNutFound) return;
    const next: CharacterCustomizationConfig = { ...state.characterConfig, ...patch };
    saveCharacterCustomization(next);
    state = { ...state, characterConfig: next };
    emit();
  },
  triggerEmote(emote: EmoteId) {
    if (emoteClearTimer !== null) {
      clearTimeout(emoteClearTimer);
    }
    const spec = EMOTE_BY_ID[emote];
    state = {
      ...state,
      activeEmote: emote,
      activeEmoteNonce: state.activeEmoteNonce + 1,
    };
    emit();
    emoteClearTimer = setTimeout(() => {
      emoteClearTimer = null;
      state = { ...state, activeEmote: null };
      emit();
    }, Math.round((spec?.durationSec ?? 2.2) * 1000));
  },
};

export function useGameStore<T>(selector: (s: GameHudState) => T): T {
  return useSyncExternalStore(
    gameStore.subscribe,
    () => selector(gameStore.getState()),
    () => selector(gameStore.getState())
  );
}
