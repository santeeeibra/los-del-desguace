/**
 * Entrega Delicada: reglas de una partida (lógica pura, sin escena ni red).
 *
 * Fases: construir (1:00) → recorrido (3:00 + lo que sobró de construir) →
 * resultado. La carga pierde integridad con los golpes, pero nunca termina la
 * partida ni elimina a nadie: con 0 % igual se puede entregar.
 * Valores iniciales para probar (diseño aprobado por el creador).
 */

export type DeliveryPhase = 'build' | 'run' | 'result';
export type DeliveryEnd = 'delivered' | 'timeout' | 'host-left';
export type RouteId = 'shortcut' | 'long';

export const DELIVERY_RULES = {
  buildSec: 60,
  runSec: 180,
  /**
   * Cambio brusco de velocidad de la carga (m/s) a partir del cual se daña.
   * Con la gravedad del juego (−18): caer 0,3 m ≈ 3,3 m/s; 1 m ≈ 6 m/s.
   * Provisional: medido con caídas en el navegador, falta ajustarlo jugando.
   */
  impactThreshold: 2.5,
  /** Integridad perdida por cada m/s por encima del umbral. */
  damagePerDeltaV: 8,
  /** Ningún golpe aislado quita más que esto. */
  maxDamagePerHit: 35,
  /** Multiplicadores de daño (menor = protege más). */
  shockAbsorber: 0.6,
  holdOnTime: 0.5,
  /** El paragolpes absorbe esta fracción del daño frontal, y pierde protección con cada golpe fuerte. */
  bumperStart: 0.6,
  bumperMin: 0.2,
  bumperLossPerHeavyHit: 0.2,
  /** Rescates (provisionales). */
  rescue: { uprightSec: 5, repairSec: 10, lostCargoSec: 10, lostCargoIntegrity: 10 },
} as const;

export interface ImpactInput {
  /** Cambio brusco de velocidad de la carga en el golpe (m/s). */
  deltaV: number;
  /** Golpe frontal del vehículo (lo amortigua el paragolpes). */
  frontal?: boolean;
  /** Un acompañante apretó Sujetar dentro de la ventana de aviso. */
  heldOnTime?: boolean;
}

export interface DeliveryLoadout {
  shockAbsorber: boolean;
  bumper: boolean;
}

export interface DeliveryState {
  phase: DeliveryPhase;
  /** Segundos restantes de la fase actual. */
  remainingSec: number;
  /** Segundos de construcción no usados, sumados al recorrido. */
  carriedOverSec: number;
  integrity: number;
  bumperProtection: number;
  route: RouteId | null;
  hits: number;
  worstHit: number;
  /** Jugadores que marcaron "Listo" durante la construcción. */
  ready: string[];
  end: DeliveryEnd | null;
  runElapsedSec: number;
  rematchVotes: string[];
}

export function createDeliveryMatch(): DeliveryState {
  return {
    phase: 'build',
    remainingSec: DELIVERY_RULES.buildSec,
    carriedOverSec: 0,
    integrity: 100,
    bumperProtection: DELIVERY_RULES.bumperStart,
    route: null,
    hits: 0,
    worstHit: 0,
    ready: [],
    end: null,
    runElapsedSec: 0,
    rematchVotes: [],
  };
}

function startRun(s: DeliveryState): DeliveryState {
  const carried = Math.max(0, Math.round(s.remainingSec));
  return { ...s, phase: 'run', carriedOverSec: carried, remainingSec: DELIVERY_RULES.runSec + carried, runElapsedSec: 0 };
}

function finish(s: DeliveryState, end: DeliveryEnd): DeliveryState {
  return { ...s, phase: 'result', end, rematchVotes: [] };
}

/** Avanza el reloj. Al agotarse construir arranca el recorrido; al agotarse el recorrido termina. */
export function tickDelivery(s: DeliveryState, dt: number): DeliveryState {
  if (s.phase === 'result' || dt <= 0) return s;
  const remaining = s.remainingSec - dt;
  if (s.phase === 'build') {
    return remaining <= 0 ? startRun({ ...s, remainingSec: 0 }) : { ...s, remainingSec: remaining };
  }
  const next = { ...s, remainingSec: Math.max(0, remaining), runElapsedSec: s.runElapsedSec + dt };
  return remaining <= 0 ? finish(next, 'timeout') : next;
}

/** Un jugador marca "Listo". Si están todos, la construcción termina y el tiempo sobrante pasa al recorrido. */
export function markReady(s: DeliveryState, playerId: string, playerCount: number): DeliveryState {
  if (s.phase !== 'build' || s.ready.includes(playerId)) return s;
  const ready = [...s.ready, playerId];
  const next = { ...s, ready };
  return ready.length >= Math.max(1, playerCount) ? startRun(next) : next;
}

/** Daño de un golpe ya con protecciones aplicadas (0 si no supera el umbral). */
export function impactDamage(s: Pick<DeliveryState, 'bumperProtection'>, impact: ImpactInput, loadout: DeliveryLoadout) {
  const R = DELIVERY_RULES;
  const over = impact.deltaV - R.impactThreshold;
  if (over <= 0) return 0;
  let dmg = over * R.damagePerDeltaV;
  if (loadout.shockAbsorber) dmg *= R.shockAbsorber;
  if (impact.heldOnTime) dmg *= R.holdOnTime;
  if (impact.frontal && loadout.bumper) dmg *= 1 - s.bumperProtection;
  return Math.min(R.maxDamagePerHit, dmg);
}

export function applyImpact(s: DeliveryState, impact: ImpactInput, loadout: DeliveryLoadout): DeliveryState {
  if (s.phase !== 'run') return s;
  const dmg = impactDamage(s, impact, loadout);
  if (dmg <= 0) return s;
  const heavy = dmg >= 10;
  const bumperProtection =
    impact.frontal && loadout.bumper && heavy
      ? Math.max(DELIVERY_RULES.bumperMin, s.bumperProtection - DELIVERY_RULES.bumperLossPerHeavyHit)
      : s.bumperProtection;
  return {
    ...s,
    integrity: Math.max(0, s.integrity - dmg),
    bumperProtection,
    hits: s.hits + 1,
    worstHit: Math.max(s.worstHit, dmg),
  };
}

/** Acompañante "Ajustar": el paragolpes vuelve a proteger como al principio. */
export function tightenBumper(s: DeliveryState): DeliveryState {
  return s.phase === 'run' ? { ...s, bumperProtection: DELIVERY_RULES.bumperStart } : s;
}

export type RescueKind = 'upright' | 'repair' | 'lostCargo';

/** Los rescates cuestan tiempo (y la carga perdida, integridad); nunca terminan la partida. */
export function applyRescue(s: DeliveryState, kind: RescueKind): DeliveryState {
  if (s.phase !== 'run') return s;
  const r = DELIVERY_RULES.rescue;
  const cost = kind === 'upright' ? r.uprightSec : kind === 'repair' ? r.repairSec : r.lostCargoSec;
  // Un rescate nunca deja el reloj en cero: siempre queda margen para intentar llegar.
  const remainingSec = Math.max(Math.min(s.remainingSec, 1), s.remainingSec - cost);
  const integrity = kind === 'lostCargo' ? Math.max(0, s.integrity - r.lostCargoIntegrity) : s.integrity;
  return { ...s, remainingSec, integrity };
}

export function chooseRoute(s: DeliveryState, route: RouteId): DeliveryState {
  return s.phase === 'run' ? { ...s, route } : s;
}

export function deliver(s: DeliveryState): DeliveryState {
  return s.phase === 'run' ? finish(s, 'delivered') : s;
}

export function hostLeft(s: DeliveryState): DeliveryState {
  return s.phase === 'result' ? s : finish(s, 'host-left');
}

export interface DeliveryScore {
  stars: 0 | 1 | 2 | 3;
  timeBonus: number;
  total: number;
  medal: 'Atajo' | 'Paciencia' | null;
  message: string;
}

/** Siempre hay resultado, también si se acabó el tiempo o se fue el anfitrión. */
export function scoreDelivery(s: DeliveryState): DeliveryScore {
  if (s.end === 'host-left') {
    return { stars: 0, timeBonus: 0, total: 0, medal: null, message: 'El anfitrión salió. La ronda terminó.' };
  }
  const delivered = s.end === 'delivered';
  const stars: DeliveryScore['stars'] = !delivered ? 0 : s.integrity >= 85 ? 3 : s.integrity >= 55 ? 2 : s.integrity > 0 ? 1 : 0;
  const timeBonus = delivered ? Math.round(s.remainingSec) * 2 : 0;
  const total = (delivered ? Math.round(s.integrity) * 10 : 0) + timeBonus;
  const medal = !delivered || !s.route ? null : s.route === 'shortcut' ? 'Atajo' : 'Paciencia';
  const message = !delivered
    ? `Se acabó el tiempo. La carga quedó al ${Math.round(s.integrity)} %.`
    : s.integrity <= 0
      ? 'Llegó hecha pedazos… pero llegó.'
      : `¡Entregada al ${Math.round(s.integrity)} %!`;
  return { stars, timeBonus, total, medal, message };
}

/** Voto de revancha: con mayoría simple arranca una partida nueva. */
export function voteRematch(s: DeliveryState, playerId: string, playerCount: number): DeliveryState {
  if (s.phase !== 'result' || s.end === 'host-left' || s.rematchVotes.includes(playerId)) return s;
  const votes = [...s.rematchVotes, playerId];
  return votes.length > Math.max(1, playerCount) / 2 ? createDeliveryMatch() : { ...s, rematchVotes: votes };
}
