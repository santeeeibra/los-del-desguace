import { useSyncExternalStore } from 'react';
import { playSuccessChime } from '../audio/sfxEngine';
import { WORKSHOP_ORIGIN } from '../invention/workshopAssembly';

export type GameModeId = 'sandbox' | 'race' | 'flight';

export const GAME_MODE_LABELS: Record<GameModeId, string> = {
  sandbox: 'Taller Libre',
  race: 'Carrera en Pista',
  flight: 'Desafío de Vuelo',
};

export const RACE_CHECKPOINTS: readonly [number, number, number][] = [
  [3, 1.2, 14],
  [3, 1.2, 27],
  [15.5, 1.2, 28],
  [15.5, 1.2, 14],
];

export const FLIGHT_TARGET_POS: readonly [number, number, number] = [2.05, 5.5, 22];
const CHECKPOINT_HIT_RADIUS = 2.8;
const FLIGHT_RING_HIT_RADIUS = 3.0;
const MIN_FLIGHT_HEIGHT = 1.1;

const BEST_RACE_STORAGE_KEY = 'los-del-desguace.bestRaceSec.v1';
const BEST_FLIGHT_STORAGE_KEY = 'los-del-desguace.bestFlightMeters.v1';

function loadSavedNumber(key: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

function saveNumber(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface GameModeState {
  mode: GameModeId;
  elapsedSec: number;
  checkpointIndex: number;
  raceFinished: boolean;
  bestRaceSec: number | null;
  currentFlightMeters: number;
  bestFlightMeters: number;
  flightTargetReached: boolean;
}

let state: GameModeState = {
  mode: 'sandbox',
  elapsedSec: 0,
  checkpointIndex: 0,
  raceFinished: false,
  bestRaceSec: loadSavedNumber(BEST_RACE_STORAGE_KEY),
  currentFlightMeters: 0,
  bestFlightMeters: loadSavedNumber(BEST_FLIGHT_STORAGE_KEY) ?? 0,
  flightTargetReached: false,
};
let savedFlightMeters = state.bestFlightMeters;
let waitForFlightRingExit = false;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function persistFlightRecord(record = state.bestFlightMeters): void {
  if (record <= savedFlightMeters) return;
  savedFlightMeters = record;
  saveNumber(BEST_FLIGHT_STORAGE_KEY, record);
}

export const gameModeStore = {
  getState(): GameModeState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setMode(mode: GameModeId): void {
    if (state.mode === mode) {
      this.resetRun();
      return;
    }
    persistFlightRecord();
    waitForFlightRingExit = false;
    state = {
      ...state,
      mode,
      elapsedSec: 0,
      checkpointIndex: 0,
      raceFinished: false,
      currentFlightMeters: 0,
      flightTargetReached: false,
    };
    emit();
  },

  resetRun(): void {
    persistFlightRecord();
    waitForFlightRingExit ||= state.mode === 'flight' && state.flightTargetReached;
    state = {
      ...state,
      elapsedSec: 0,
      checkpointIndex: 0,
      raceFinished: false,
      currentFlightMeters: 0,
      flightTargetReached: false,
    };
    emit();
  },

  advanceCheckpoint(): void {
    if (state.mode !== 'race' || state.raceFinished) return;

    playSuccessChime();

    const nextIndex = state.checkpointIndex + 1;
    if (nextIndex >= RACE_CHECKPOINTS.length) {
      const finishedTime = state.elapsedSec;
      const isNewBest = state.bestRaceSec === null || finishedTime < state.bestRaceSec;
      const nextBest = isNewBest ? finishedTime : state.bestRaceSec;
      if (isNewBest && nextBest !== null) {
        saveNumber(BEST_RACE_STORAGE_KEY, nextBest);
      }
      state = {
        ...state,
        raceFinished: true,
        bestRaceSec: nextBest,
      };
      emit();
      return;
    }

    state = {
      ...state,
      checkpointIndex: nextIndex,
    };
    emit();
  },

  tick(dt: number, pos: Vec3Like): void {
    if (state.mode === 'sandbox') return;
    const safeDt = Math.min(Math.max(dt, 0), 0.1);

    if (state.mode === 'race') {
      if (state.raceFinished) return;

      const elapsed = state.elapsedSec;
      const nextElapsed = elapsed + safeDt;
      const target = RACE_CHECKPOINTS[state.checkpointIndex];
      const dist = Math.hypot(pos.x - target[0], pos.y - target[1], pos.z - target[2]);

      state = {
        ...state,
        elapsedSec: nextElapsed,
      };

      if (dist <= CHECKPOINT_HIT_RADIUS) {
        this.advanceCheckpoint();
      } else if (Math.floor(nextElapsed * 10) !== Math.floor(elapsed * 10)) {
        emit();
      }
      return;
    }

    if (state.mode === 'flight') {
      if (pos.y < MIN_FLIGHT_HEIGHT) {
        persistFlightRecord();
        waitForFlightRingExit = false;
        return;
      }
      const distFromWorkshop = Math.hypot(
        pos.x - WORKSHOP_ORIGIN[0],
        Math.max(0, pos.y - WORKSHOP_ORIGIN[1]),
        pos.z - WORKSHOP_ORIGIN[2]
      );
      const distToRing = Math.hypot(
        pos.x - FLIGHT_TARGET_POS[0],
        pos.y - FLIGHT_TARGET_POS[1],
        pos.z - FLIGHT_TARGET_POS[2]
      );

      const meters = Math.round(distFromWorkshop * 10) / 10;
      const inRing = distToRing <= FLIGHT_RING_HIT_RADIUS;
      if (!inRing) waitForFlightRingExit = false;
      const reached = state.flightTargetReached || (inRing && !waitForFlightRingExit);
      const justReachedFlightTarget = !state.flightTargetReached && reached;
      if (meters === state.currentFlightMeters && reached === state.flightTargetReached) return;
      const nextBest = Math.max(meters, state.bestFlightMeters);
      if (nextBest > state.bestFlightMeters) {
        if (Math.floor(nextBest) > Math.floor(state.bestFlightMeters) || reached !== state.flightTargetReached) {
          persistFlightRecord(nextBest);
        }
      }

      state = {
        ...state,
        currentFlightMeters: meters,
        bestFlightMeters: nextBest,
        flightTargetReached: reached,
      };
      if (justReachedFlightTarget) {
        playSuccessChime();
      }
      emit();
    }
  },
};

export function useGameModeStore<T>(selector: (s: GameModeState) => T): T {
  return useSyncExternalStore(
    gameModeStore.subscribe,
    () => selector(gameModeStore.getState()),
    () => selector(gameModeStore.getState())
  );
}
