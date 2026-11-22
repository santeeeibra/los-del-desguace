import { useSyncExternalStore } from 'react';
import { playSuccessChime, playWoodClick } from '../audio/sfxEngine';

export type ExpeditionLevelId = 'level-1-swamp' | 'level-2-wind' | 'level-3-crusher';

export interface Vec3Tuple {
  readonly 0: number;
  readonly 1: number;
  readonly 2: number;
}

export interface ExpeditionLevelDef {
  id: ExpeditionLevelId;
  number: 1 | 2 | 3;
  title: string;
  subtitle: string;
  badge: string;
  lengthLabel: string;
  summary: string;
  origin: readonly [number, number, number];
  /** Punto de aparición inicial (en coordenadas locales respecto a `origin`). */
  spawnLocal: readonly [number, number, number];
  /** Centro de la bahía de armado del nivel (local): ahí aparecen las piezas del dispensador. */
  bayLocal?: readonly [number, number, number];
  /** Puntos de control intermedios (locales). */
  checkpointsLocal: readonly (readonly [number, number, number])[];
  /** Meta / cima final (local). */
  goalLocal: readonly [number, number, number];
  /** Tuerca Dorada secreta del nivel (local). */
  goldenNutLocal: readonly [number, number, number];
  /** Altura Y por debajo de la cual el jugador reaparece en el último punto de control. */
  fallKillY: number;
}

export const EXPEDITION_LEVELS: readonly ExpeditionLevelDef[] = [
  {
    id: 'level-1-swamp',
    number: 1,
    title: 'El Puente del Abismo',
    subtitle: 'Armá una máquina que cruce el puente angosto',
    badge: 'Invento · 98 m',
    lengthLabel: '98 m · puente de 66 m',
    summary:
      'Armá en la bahía una máquina que cruce el puente angosto sin caerse. Si preferís ir a pie, bajá por la rampa, cruzá el barro del fondo y trepá del otro lado: se tarda muchísimo más.',
    origin: [140, 0, 0],
    spawnLocal: [0, 1.8, 4],
    bayLocal: [0, 0, 6],
    checkpointsLocal: [
      [0, 1.8, 46],
      [0, 1.8, 84],
    ],
    goalLocal: [0, 1.6, 96],
    goldenNutLocal: [0, -10.2, 46],
    fallKillY: -20,
  },
  {
    id: 'level-2-wind',
    number: 2,
    title: 'El Callejón de los Autos',
    subtitle: 'Armá una máquina pesada que rompa dos barreras de autos',
    badge: 'Impacto · 98 m',
    lengthLabel: '98 m · 2 barreras',
    summary:
      'Un callejón del desguace está tapado por dos pilas de autos: una liviana y otra pesada. Armá una máquina con masa y velocidad para empujarlos y romperlos hasta el portón. A pie se puede rodear por la pasarela de arriba, pero se tarda mucho más.',
    origin: [280, 0, 0],
    spawnLocal: [0, 1.8, 4],
    bayLocal: [0, 0, 6],
    checkpointsLocal: [
      [0, 1.8, 50],
      [0, 1.8, 80],
    ],
    goalLocal: [0, 1.6, 96],
    goldenNutLocal: [-7, 6.2, 84],
    fallKillY: -8,
  },
  {
    id: 'level-3-crusher',
    number: 3,
    title: 'Planta Trituradora',
    subtitle: 'Martillos, puente frágil y compuerta',
    badge: 'Ingeniería · 104 m',
    lengthLabel: '104 m · 3 salas',
    summary: 'Esquivá los martillos pendulares, cruzá el puente colapsable y abrí la compuerta hidráulica hasta el podio.',
    origin: [420, 0, 0],
    spawnLocal: [0, 1.8, 4],
    checkpointsLocal: [
      [0, 1.8, 44],
      [0, 1.8, 76],
    ],
    goalLocal: [0, 3.0, 101],
    goldenNutLocal: [0, 7.2, 27],
    fallKillY: -7,
  },
] as const;

export const EXPEDITION_LEVEL_BY_ID: Record<ExpeditionLevelId, ExpeditionLevelDef> = {
  'level-1-swamp': EXPEDITION_LEVELS[0],
  'level-2-wind': EXPEDITION_LEVELS[1],
  'level-3-crusher': EXPEDITION_LEVELS[2],
};

export interface ExpeditionProgressEntry {
  completed: boolean;
  bestTimeSec: number | null;
  goldenNut: boolean;
}

export interface ExpeditionState {
  activeLevelId: ExpeditionLevelId | null;
  /** Índice de checkpoint alcanzado: 0 = inicio, 1..N = checkpoints intermedios. */
  checkpointIndex: number;
  elapsedSec: number;
  completedNow: boolean;
  goldenNutThisRun: boolean;
  /** Sube cada vez que se inicia un nivel: los elementos físicos (autos) se reconstruyen. */
  runNonce: number;
  /** Destino de teletransporte en mundo (con nonce para disparar incluso al mismo punto). */
  teleportRequest: { pos: [number, number, number]; nonce: number } | null;
  progress: Record<ExpeditionLevelId, ExpeditionProgressEntry>;
}

const STORAGE_KEY = 'los-del-desguace.expeditions.v1';

function defaultProgress(): Record<ExpeditionLevelId, ExpeditionProgressEntry> {
  return {
    'level-1-swamp': { completed: false, bestTimeSec: null, goldenNut: false },
    'level-2-wind': { completed: false, bestTimeSec: null, goldenNut: false },
    'level-3-crusher': { completed: false, bestTimeSec: null, goldenNut: false },
  };
}

function loadProgress(): Record<ExpeditionLevelId, ExpeditionProgressEntry> {
  const base = defaultProgress();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<ExpeditionLevelId, Partial<ExpeditionProgressEntry>>>;
    for (const id of Object.keys(base) as ExpeditionLevelId[]) {
      const p = parsed[id];
      if (!p) continue;
      base[id] = {
        completed: Boolean(p.completed),
        bestTimeSec: typeof p.bestTimeSec === 'number' && Number.isFinite(p.bestTimeSec) ? p.bestTimeSec : null,
        goldenNut: Boolean(p.goldenNut),
      };
    }
  } catch {
    // Ignore storage unavailability
  }
  return base;
}

function saveProgress(progress: Record<ExpeditionLevelId, ExpeditionProgressEntry>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore quota/privacy errors
  }
}

export function localToWorld(
  origin: readonly [number, number, number],
  local: readonly [number, number, number],
): [number, number, number] {
  return [origin[0] + local[0], origin[1] + local[1], origin[2] + local[2]];
}

/** Calcula la fuerza de ráfaga lateral (0 en calma, 1 en pico) con ciclo rítmico predecible. */
export function windGustFactor(timeSec: number, phaseOffset = 0): number {
  const cycle = ((timeSec + phaseOffset) % 6 + 6) % 6;
  // 0..2.2s calma, 2.2..5.2s ráfaga suave-fuerte-suave, 5.2..6.0s calma
  if (cycle < 2.2 || cycle > 5.2) return 0;
  const u = (cycle - 2.2) / 3.0;
  return Math.sin(u * Math.PI);
}

/** Factor de frenado por barro/aceite (devuelve multiplicador de velocidad horizontal). */
export function mudDragMultiplier(dt: number, strength = 4.6): number {
  return Math.exp(-Math.max(0, dt) * strength);
}

const WORKSHOP_RETURN_POS: [number, number, number] = [-0.6, 1.35, 4.2];

let teleportNonce = 0;
let state: ExpeditionState = {
  activeLevelId: null,
  checkpointIndex: 0,
  elapsedSec: 0,
  completedNow: false,
  goldenNutThisRun: false,
  runNonce: 0,
  teleportRequest: null,
  progress: loadProgress(),
};

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export const expeditionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getState(): ExpeditionState {
    return state;
  },
  startLevel(id: ExpeditionLevelId) {
    const def = EXPEDITION_LEVEL_BY_ID[id];
    const spawnPos = localToWorld(def.origin, def.spawnLocal);
    teleportNonce += 1;
    state = {
      ...state,
      activeLevelId: id,
      checkpointIndex: 0,
      elapsedSec: 0,
      completedNow: false,
      goldenNutThisRun: state.progress[id].goldenNut,
      runNonce: state.runNonce + 1,
      teleportRequest: { pos: spawnPos, nonce: teleportNonce },
    };
    playWoodClick();
    emit();
  },
  exitToWorkshop() {
    if (!state.activeLevelId) return;
    teleportNonce += 1;
    state = {
      ...state,
      activeLevelId: null,
      checkpointIndex: 0,
      elapsedSec: 0,
      completedNow: false,
      goldenNutThisRun: false,
      teleportRequest: { pos: [...WORKSHOP_RETURN_POS], nonce: teleportNonce },
    };
    playWoodClick();
    emit();
  },
  respawnAtCheckpoint() {
    if (!state.activeLevelId) return;
    const def = EXPEDITION_LEVEL_BY_ID[state.activeLevelId];
    const local =
      state.checkpointIndex > 0 && state.checkpointIndex <= def.checkpointsLocal.length
        ? def.checkpointsLocal[state.checkpointIndex - 1]
        : def.spawnLocal;
    teleportNonce += 1;
    state = {
      ...state,
      teleportRequest: { pos: localToWorld(def.origin, local), nonce: teleportNonce },
    };
    emit();
  },
  reachCheckpoint(index: number) {
    if (!state.activeLevelId || index <= state.checkpointIndex) return;
    state = { ...state, checkpointIndex: index };
    playSuccessChime();
    emit();
  },
  collectGoldenNut() {
    if (!state.activeLevelId || state.goldenNutThisRun) return;
    const id = state.activeLevelId;
    const nextProgress = {
      ...state.progress,
      [id]: { ...state.progress[id], goldenNut: true },
    };
    saveProgress(nextProgress);
    state = { ...state, goldenNutThisRun: true, progress: nextProgress };
    playSuccessChime();
    emit();
  },
  completeActiveLevel() {
    if (!state.activeLevelId || state.completedNow) return;
    const id = state.activeLevelId;
    const prev = state.progress[id];
    const time = Math.round(state.elapsedSec * 10) / 10;
    const bestTimeSec = prev.bestTimeSec === null ? time : Math.min(prev.bestTimeSec, time);
    const nextProgress = {
      ...state.progress,
      [id]: { ...prev, completed: true, bestTimeSec },
    };
    saveProgress(nextProgress);
    state = { ...state, completedNow: true, progress: nextProgress };
    playSuccessChime();
    emit();
  },
  tick(dt: number) {
    if (!state.activeLevelId || state.completedNow) return;
    const next = state.elapsedSec + Math.min(dt, 0.1);
    if (Math.floor(next * 10) !== Math.floor(state.elapsedSec * 10)) {
      state = { ...state, elapsedSec: next };
      emit();
    } else {
      state.elapsedSec = next;
    }
  },
  resetForTests() {
    teleportNonce = 0;
    state = {
      activeLevelId: null,
      checkpointIndex: 0,
      elapsedSec: 0,
      completedNow: false,
      goldenNutThisRun: false,
      runNonce: 0,
      teleportRequest: null,
      progress: defaultProgress(),
    };
    emit();
  },
};

export function useExpeditionStore(): ExpeditionState {
  return useSyncExternalStore(expeditionStore.subscribe, expeditionStore.getState);
}
