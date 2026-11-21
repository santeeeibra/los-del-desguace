import { useSyncExternalStore } from 'react';
import { gameStore } from '../../state/gameStore';
import { gameModeStore } from '../gameModes';
import {
  applyImpact,
  createDeliveryMatch,
  deliver,
  markReady,
  scoreDelivery,
  tickDelivery,
  voteRematch,
  type DeliveryLoadout,
  type DeliveryState,
  type ImpactInput,
} from './deliveryMatch';

/**
 * Estado de Entrega Delicada en el juego local (un jugador por ahora).
 * El anfitrión online usará las mismas reglas de deliveryMatch.ts.
 */

/** Caja del patio que hace de carga frágil (está sola, sin otra encima). */
export const DELIVERY_CARGO_ID = 'crate-3';
/** Al empezar cada partida la carga se coloca acá, a la vista del jugador y cerca del carrito. */
export const DELIVERY_CARGO_SPAWN: [number, number, number] = [0.3, 0.45, 3.0];
/** Zona de entrega al final de la pista (radio en metros, medido en el plano). */
export const DELIVERY_ZONE: { position: [number, number, number]; radius: number } = {
  position: [15.5, 0.05, 27.5],
  radius: 2.6,
};
export const LOCAL_PLAYER_ID = 'local';

interface DeliveryStoreState {
  match: DeliveryState;
  /** Se incrementa al empezar una partida nueva. */
  resetNonce: number;
  lastHit: { damage: number; at: number } | null;
}

let state: DeliveryStoreState = { match: createDeliveryMatch(), resetNonce: 0, lastHit: null };
const listeners = new Set<() => void>();
let lastEmittedSecond = -1;

function set(next: Partial<DeliveryStoreState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Por ahora el armado no aplica protecciones; llegan con los slots de la etapa 3. */
const NO_LOADOUT: DeliveryLoadout = { shockAbsorber: false, bumper: false };

export const deliveryStore = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Partida nueva: devuelve piezas, carga y jugador a su lugar inicial (como «Reiniciar Piezas»). */
  start() {
    if (gameStore.getState().wrenchEquipped) gameStore.toggleWrench();
    gameStore.triggerReset();
    lastEmittedSecond = -1;
    set({ match: createDeliveryMatch(), resetNonce: state.resetNonce + 1, lastHit: null });
  },

  tick(dt: number) {
    const before = state.match;
    const match = tickDelivery(before, dt);
    if (match === before) return;
    const second = Math.ceil(match.remainingSec);
    // Solo se avisa a la UI una vez por segundo o al cambiar de fase.
    if (second !== lastEmittedSecond || match.phase !== before.phase) {
      lastEmittedSecond = second;
      set({ match });
    } else {
      state = { ...state, match };
    }
  },

  ready() {
    set({ match: markReady(state.match, LOCAL_PLAYER_ID, 1) });
  },

  impact(impact: ImpactInput, now: number) {
    const before = state.match;
    const match = applyImpact(before, impact, NO_LOADOUT);
    if (match === before) return;
    set({ match, lastHit: { damage: before.integrity - match.integrity, at: now } });
  },

  deliver() {
    set({ match: deliver(state.match) });
  },

  rematch() {
    const match = voteRematch(state.match, LOCAL_PLAYER_ID, 1);
    if (match !== state.match) {
      gameStore.triggerReset();
      lastEmittedSecond = -1;
      set({ match, resetNonce: state.resetNonce + 1, lastHit: null });
    }
  },

  score: () => scoreDelivery(state.match),
};

// Al entrar al modo arranca una partida nueva. No se escucha resetRun: el
// reinicio de escena también lo llama y eso volvería a arrancar en bucle.
let previousMode = gameModeStore.getState().mode;
gameModeStore.subscribe(() => {
  const mode = gameModeStore.getState().mode;
  const entered = mode === 'delivery' && previousMode !== 'delivery';
  previousMode = mode;
  if (entered) deliveryStore.start();
});

export function useDeliveryStore<T>(selector: (s: DeliveryStoreState) => T): T {
  return useSyncExternalStore(
    deliveryStore.subscribe,
    () => selector(deliveryStore.getState()),
    () => selector(deliveryStore.getState())
  );
}

/**
 * Cambio de velocidad de la carga en un paso de física, sin la gravedad.
 * Es lo que se usa como fuerza del golpe (m/s).
 */
export function impactDeltaV(prev: { x: number; y: number; z: number }, next: { x: number; y: number; z: number }, gravityY: number, dt: number) {
  return Math.hypot(next.x - prev.x, next.y - prev.y - gravityY * dt, next.z - prev.z);
}

export function inDeliveryZone(p: { x: number; z: number }) {
  return Math.hypot(p.x - DELIVERY_ZONE.position[0], p.z - DELIVERY_ZONE.position[2]) <= DELIVERY_ZONE.radius;
}
