import { useSyncExternalStore } from 'react';
import { playSuccessChime } from '../audio/sfxEngine';
import { arenaAndBridgeStore, BRIDGE_GOAL_POS, BRIDGE_SPAN_Z_MIN, ROBOT_ARENA_CENTER } from './arenaAndBridge';
import { gameModeStore } from './gameModes';

export type ContractId =
  | 'first-drive'
  | 'west-freight'
  | 'ramp-climb'
  | 'yard-bumps'
  | 'speed-lap'
  | 'air-ring'
  | 'stunt-ramp'
  | 'balloon-sky'
  | 'barrel-smash'
  | 'no-wheels'
  | 'robot-arena'
  | 'aerial-duel'
  | 'poly-bridge';

export interface WorkshopContract {
  id: ContractId;
  title: string;
  badge: string;
  description: string;
  recommendedParts: string;
  targetPos: readonly [number, number, number];
  hitRadius: number;
  kind: 'reach' | 'race' | 'flight' | 'arena';
  onFoot?: boolean;
  timeLimitSec?: number;
}

export const BOWLING_BARREL_IDS = ['bowl-1', 'bowl-2', 'bowl-3'] as const;

export const WORKSHOP_CONTRACTS: readonly WorkshopContract[] = [
  {
    id: 'first-drive',
    title: '1. Primer Arranque',
    badge: 'Fácil',
    description: 'Armá un carrito o usá el Clásico. Subite y cruzá el arco amarillo de salida.',
    recommendedParts: 'Asiento + Motor + 4 Ruedas',
    targetPos: [3.0, 0.85, 12.25],
    hitRadius: 2.0,
    kind: 'reach',
    timeLimitSec: 35,
  },
  {
    id: 'west-freight',
    title: '2. Ruta al Patio Oeste',
    badge: 'Exploración',
    description: 'Llegá a la zona de carga del patio oeste. Podés ir a pie o llevar tu invento.',
    recommendedParts: 'A pie o con tu invento',
    targetPos: [-15.5, 1.0, 2.5],
    hitRadius: 3.2,
    kind: 'reach',
    onFoot: true,
    timeLimitSec: 45,
  },
  {
    id: 'ramp-climb',
    title: '3. Subida a la Rampa',
    badge: 'Potencia',
    description: 'Subí por la rampa de madera hasta el centro de la plataforma, a pie o con tu invento.',
    recommendedParts: 'A pie o con un vehículo liviano',
    targetPos: [-16.8, 1.16, -2.5],
    hitRadius: 1.35,
    kind: 'reach',
    onFoot: true,
    timeLimitSec: 45,
  },
  {
    id: 'yard-bumps',
    title: '4. Lomas del Desguace',
    badge: 'Terreno',
    description: 'Superá las lomas irregulares del patio sur sin volcar.',
    recommendedParts: 'Chasis equilibrado + 4 Ruedas',
    targetPos: [-14.5, 1.0, 13.8],
    hitRadius: 3.0,
    kind: 'reach',
    timeLimitSec: 50,
  },
  {
    id: 'speed-lap',
    title: '5. Vuelta Rápida',
    badge: 'Contrarreloj',
    description: 'Completá los 4 aros de la pista en menos de 28 segundos.',
    recommendedParts: 'Motor + Cohete Turbo',
    targetPos: [3.0, 1.2, 14.0],
    hitRadius: 2.8,
    kind: 'race',
    timeLimitSec: 28,
  },
  {
    id: 'air-ring',
    title: '6. Salto al Aro Aéreo',
    badge: 'Vuelo',
    description: 'Despegá y atravesá el aro suspendido a 5.5 metros de altura.',
    recommendedParts: '2 Alas + Cohete + Batería',
    targetPos: [2.05, 5.5, 22.0],
    hitRadius: 3.0,
    kind: 'flight',
    timeLimitSec: 45,
  },
  {
    id: 'stunt-ramp',
    title: '7. Salto de Acrobacia',
    badge: 'Acrobacia',
    description: 'Saltá por la rampa acrobática y alcanzá el objetivo suspendido en el aire.',
    recommendedParts: 'Resorte + Cohete',
    targetPos: [9.5, 4.2, 25.0],
    hitRadius: 3.4,
    kind: 'reach',
    timeLimitSec: 45,
  },
  {
    id: 'balloon-sky',
    title: '8. Dirigible de Globos',
    badge: 'Globos',
    description: 'Elevá tu invento con globos de helio y turbinas hasta la baliza aérea alta.',
    recommendedParts: '2 Globos + Turbina',
    targetPos: [2.05, 7.2, 14.0],
    hitRadius: 3.6,
    kind: 'reach',
    timeLimitSec: 50,
  },
  {
    id: 'barrel-smash',
    title: '9. Demolición de Barriles',
    badge: 'Choque',
    description: 'Llegá al fondo de la pista y desplazá al menos dos barriles de la pirámide.',
    recommendedParts: 'Motor + Cohete + Bocina',
    targetPos: [3.0, 1.2, 26.5],
    hitRadius: 3.2,
    kind: 'reach',
    timeLimitSec: 45,
  },
  {
    id: 'no-wheels',
    title: '10. Locura Sin Ruedas',
    badge: 'Creativo',
    description: 'Cruzá el arco de salida sin ruedas: a puro salto, globos o turbinas locas.',
    recommendedParts: 'Resortes / Globos / Turbinas',
    targetPos: [3.0, 1.2, 11.0],
    hitRadius: 3.0,
    kind: 'reach',
    timeLimitSec: 55,
  },
  {
    id: 'robot-arena',
    title: '11. Lucha de Robots',
    badge: 'Arena',
    description: 'Entrá a la Arena del Yunke (noreste) y sacá del ring a los 2 robots rivales.',
    recommendedParts: 'Robot Ariete: Parachoques + Motor + Bocina',
    targetPos: [ROBOT_ARENA_CENTER[0], 0.9, ROBOT_ARENA_CENTER[2]],
    hitRadius: 7.2,
    kind: 'arena',
    timeLimitSec: 75,
  },
  {
    id: 'aerial-duel',
    title: '12. Duelo Aéreo',
    badge: 'Aéreo',
    description: 'Despegá hacia el cielo de la pista y derribá los 3 drones enemigos.',
    recommendedParts: 'Avión Cazador: 2 Alas + Cohete + Turbina',
    targetPos: [9.5, 8.8, 20.0],
    hitRadius: 8.5,
    kind: 'arena',
    timeLimitSec: 80,
  },
  {
    id: 'poly-bridge',
    title: '13. Prueba de Puente',
    badge: 'Ingeniería',
    description: 'Cruzá el puente colgante del suroeste sin sobrecargarlo ni caer al foso.',
    recommendedParts: 'Vehículo liviano / Alas / Suspensión',
    targetPos: BRIDGE_GOAL_POS,
    hitRadius: 3.2,
    kind: 'reach',
    timeLimitSec: 60,
  },
] as const;

const CONTRACTS_STORAGE_KEY = 'los-del-desguace.contracts.v1';
let waitForReachTargetExit = false;
let bridgeCheckpoint = 0;

export interface ContractProgress {
  bestNuts: number; // 1..3
  bestTimeSec: number | null;
}

export interface ContractStoreState {
  activeContractId: ContractId | null;
  elapsedSec: number;
  completedNow: boolean;
  lastNutsEarned: number;
  brokenWeldsCount: number;
  canRepairLastBuild: boolean;
  progress: Partial<Record<ContractId, ContractProgress>>;
}

function loadContractProgress(): Partial<Record<ContractId, ContractProgress>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CONTRACTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveContractProgress(progress: Partial<Record<ContractId, ContractProgress>>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONTRACTS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors
  }
}

let state: ContractStoreState = {
  activeContractId: null,
  elapsedSec: 0,
  completedNow: false,
  lastNutsEarned: 0,
  brokenWeldsCount: 0,
  canRepairLastBuild: false,
  progress: loadContractProgress(),
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export const contractStore = {
  getState: () => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  startContract(id: ContractId): void {
    const contract = WORKSHOP_CONTRACTS.find((c) => c.id === id);
    if (!contract) return;
    waitForReachTargetExit = contract.kind === 'reach' && id === state.activeContractId &&
      (state.completedNow || waitForReachTargetExit);
    arenaAndBridgeStore.reset();
    bridgeCheckpoint = 0;
    if (contract.kind === 'race') {
      gameModeStore.setMode('race');
    } else if (contract.kind === 'flight') {
      gameModeStore.setMode('flight');
    } else {
      gameModeStore.setMode('sandbox');
    }
    state = {
      ...state,
      activeContractId: id,
      elapsedSec: 0,
      completedNow: false,
      lastNutsEarned: 0,
    };
    emit();
  },

  clearContract(): void {
    if (!state.activeContractId && !state.completedNow) return;
    gameModeStore.setMode('sandbox');
    arenaAndBridgeStore.reset();
    bridgeCheckpoint = 0;
    waitForReachTargetExit = false;
    state = {
      ...state,
      activeContractId: null,
      elapsedSec: 0,
      completedNow: false,
      lastNutsEarned: 0,
    };
    emit();
  },

  setBrokenWelds(brokenWeldsCount: number, canRepairLastBuild?: boolean): void {
    const nextRepair = canRepairLastBuild ?? state.canRepairLastBuild;
    if (state.brokenWeldsCount === brokenWeldsCount && state.canRepairLastBuild === nextRepair) return;
    state = {
      ...state,
      brokenWeldsCount,
      canRepairLastBuild: nextRepair,
    };
    emit();
  },

  setCanRepair(canRepairLastBuild: boolean): void {
    if (state.canRepairLastBuild === canRepairLastBuild) return;
    state = { ...state, canRepairLastBuild };
    emit();
  },

  completeActiveContract(timeSec: number): void {
    const id = state.activeContractId;
    if (!id || state.completedNow) return;
    const contract = WORKSHOP_CONTRACTS.find((c) => c.id === id);
    if (!contract) return;

    let nuts = 1;
    const limit = contract.timeLimitSec ?? 45;
    if (timeSec <= limit * 0.65 && state.brokenWeldsCount === 0) nuts = 3;
    else if (timeSec <= limit && state.brokenWeldsCount <= 1) nuts = 2;

    const prev = state.progress[id];
    const nextEntry: ContractProgress = {
      bestNuts: Math.max(prev?.bestNuts ?? 0, nuts),
      bestTimeSec: prev?.bestTimeSec != null ? Math.min(prev.bestTimeSec, timeSec) : timeSec,
    };
    const nextProgress = { ...state.progress, [id]: nextEntry };
    saveContractProgress(nextProgress);

    state = {
      ...state,
      completedNow: true,
      lastNutsEarned: nuts,
      progress: nextProgress,
    };
    playSuccessChime();
    emit();
  },

  tickContract(
    dt: number,
    pos: { x: number; y: number; z: number },
    objectives?: { wheels: number; displacedBarrels: number; onFoot?: boolean },
  ): void {
    const id = state.activeContractId;
    if (!id || state.completedNow) return;
    const contract = WORKSHOP_CONTRACTS.find((c) => c.id === id);
    if (!contract || (objectives?.onFoot && !contract.onFoot)) return;

    const nextElapsed = state.elapsedSec + Math.min(Math.max(dt, 0), 0.1);
    const gm = gameModeStore.getState();

    if (contract.kind === 'race') {
      if (gm.raceFinished) {
        state = { ...state, elapsedSec: gm.elapsedSec };
        this.completeActiveContract(gm.elapsedSec);
        return;
      }
      if (Math.floor(nextElapsed * 10) !== Math.floor(state.elapsedSec * 10)) {
        state = { ...state, elapsedSec: nextElapsed };
        emit();
      } else {
        state = { ...state, elapsedSec: nextElapsed };
      }
      return;
    }

    if (contract.kind === 'flight') {
      if (gm.flightTargetReached) {
        state = { ...state, elapsedSec: nextElapsed };
        this.completeActiveContract(nextElapsed);
        return;
      }
      if (Math.floor(nextElapsed * 10) !== Math.floor(state.elapsedSec * 10)) {
        state = { ...state, elapsedSec: nextElapsed };
        emit();
      } else {
        state = { ...state, elapsedSec: nextElapsed };
      }
      return;
    }

    if (contract.kind === 'arena') {
      const ab = arenaAndBridgeStore.getState();
      const won = id === 'robot-arena'
        ? ab.robotsKnockedOut >= ab.totalRobots
        : id === 'aerial-duel'
          ? ab.dronesDestroyed >= ab.totalDrones
          : false;
      if (won) {
        state = { ...state, elapsedSec: nextElapsed };
        this.completeActiveContract(nextElapsed);
        return;
      }
      if (Math.floor(nextElapsed * 10) !== Math.floor(state.elapsedSec * 10)) {
        state = { ...state, elapsedSec: nextElapsed };
        emit();
      } else {
        state = { ...state, elapsedSec: nextElapsed };
      }
      return;
    }

    const [tx, ty, tz] = contract.targetPos;
    const dist = Math.hypot(pos.x - tx, pos.y - ty, pos.z - tz);
    if (dist > contract.hitRadius) waitForReachTargetExit = false;
    if (id === 'poly-bridge') {
      const onRoute = Math.abs(pos.x - tx) < 2.2 && pos.y > 0.35 && pos.y < 2.5;
      if (!onRoute || pos.z < BRIDGE_SPAN_Z_MIN - 1) bridgeCheckpoint = 0;
      else if (bridgeCheckpoint === 0 && pos.z >= BRIDGE_SPAN_Z_MIN && pos.z < 27) bridgeCheckpoint = 1;
      else if (bridgeCheckpoint === 1 && pos.z >= 28 && pos.z < 31) bridgeCheckpoint = 2;
      else if (bridgeCheckpoint === 2 && pos.z >= 32 && pos.z < 35) bridgeCheckpoint = 3;
    }
    const meetsRequirement = id === 'no-wheels' ? objectives?.wheels === 0
      : id === 'barrel-smash' ? (objectives?.displacedBarrels ?? 0) >= 2
      : id === 'poly-bridge' ? bridgeCheckpoint === 3 && pos.z >= tz - 1 && !arenaAndBridgeStore.getState().bridgeCollapsed
      : true;
    if (dist <= contract.hitRadius && !waitForReachTargetExit && meetsRequirement) {
      state = { ...state, elapsedSec: nextElapsed };
      this.completeActiveContract(nextElapsed);
      return;
    }

    if (Math.floor(nextElapsed * 10) !== Math.floor(state.elapsedSec * 10)) {
      state = { ...state, elapsedSec: nextElapsed };
      emit();
    } else {
      state = { ...state, elapsedSec: nextElapsed };
    }
  },
};

export function useContractStore<T>(selector: (s: ContractStoreState) => T): T {
  return useSyncExternalStore(
    contractStore.subscribe,
    () => selector(contractStore.getState()),
    () => selector(contractStore.getState())
  );
}
