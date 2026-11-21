/**
 * Entrega Delicada: slots del chasis y reglas de armado (lógica pura).
 *
 *            [D] paragolpes
 *   [R1]━━━━━━━━━━━━━━━━[R2]   eje delantero
 *  P1 ▐     P0 conductor    ▌ P2   estribos laterales
 *            [M] motor
 *            [C] soporte de carga · [B] bordes del soporte
 *   [R3]━━━━━━━━━━━━━━━━[R4]   eje trasero
 *            P3 estribo trasero
 *
 * Tipo de pieza ≠ cantidad: 5 categorías / 7 variantes; 13 piezas en el banco.
 */

export type SlotId = 'R1' | 'R2' | 'R3' | 'R4' | 'M' | 'D' | 'C' | 'B';
export type PieceType = 'wheel_big' | 'wheel_small' | 'motor_strong' | 'motor_soft' | 'bumper' | 'shock_absorber' | 'railings';

export const PIECE_SLOTS: Record<PieceType, readonly SlotId[]> = {
  wheel_big: ['R1', 'R2', 'R3', 'R4'],
  wheel_small: ['R1', 'R2', 'R3', 'R4'],
  motor_strong: ['M'],
  motor_soft: ['M'],
  bumper: ['D'],
  shock_absorber: ['C'],
  railings: ['B'],
};

/** Cantidades en el banco al empezar cada partida. */
export const BENCH_STOCK: Record<PieceType, number> = {
  wheel_big: 4,
  wheel_small: 4,
  motor_strong: 1,
  motor_soft: 1,
  bumper: 1,
  shock_absorber: 1,
  railings: 1,
};

export const PIECE_LABELS: Record<PieceType, string> = {
  wheel_big: 'Rueda grande',
  wheel_small: 'Rueda chica',
  motor_strong: 'Motor fuerte',
  motor_soft: 'Motor suave',
  bumper: 'Paragolpes',
  shock_absorber: 'Amortiguador',
  railings: 'Barandas',
};

/** Masa extra aproximada de cada pieza opcional (kg); afecta aceleración y velocidad. */
export const PIECE_MASS: Partial<Record<PieceType, number>> = { bumper: 6, shock_absorber: 4, railings: 5 };

export type Loadout = Partial<Record<SlotId, PieceType>>;

const AXLE_PARTNER: Partial<Record<SlotId, SlotId>> = { R1: 'R2', R2: 'R1', R3: 'R4', R4: 'R3' };
const isWheel = (p?: PieceType) => p === 'wheel_big' || p === 'wheel_small';

export type PlaceResult = { ok: true; loadout: Loadout } | { ok: false; reason: string };

/** Encastra una pieza en un slot. Rechaza slots equivocados y ruedas mezcladas en el mismo eje. */
export function placePiece(loadout: Loadout, slot: SlotId, piece: PieceType, used: Partial<Record<PieceType, number>> = countPieces(loadout)): PlaceResult {
  if (!PIECE_SLOTS[piece].includes(slot)) return { ok: false, reason: `${PIECE_LABELS[piece]} no va en ese lugar` };
  if (loadout[slot]) return { ok: false, reason: 'Ese lugar ya está ocupado' };
  if ((used[piece] ?? 0) >= BENCH_STOCK[piece]) return { ok: false, reason: `No quedan piezas: ${PIECE_LABELS[piece]}` };
  const partner = AXLE_PARTNER[slot];
  const other = partner ? loadout[partner] : undefined;
  if (isWheel(piece) && isWheel(other) && other !== piece) return { ok: false, reason: 'Mismo tamaño en cada eje' };
  return { ok: true, loadout: { ...loadout, [slot]: piece } };
}

export function removePiece(loadout: Loadout, slot: SlotId): Loadout {
  const next = { ...loadout };
  delete next[slot];
  return next;
}

export function countPieces(loadout: Loadout) {
  const used: Partial<Record<PieceType, number>> = {};
  for (const p of Object.values(loadout)) if (p) used[p] = (used[p] ?? 0) + 1;
  return used;
}

/** Qué falta para poder arrancar (vacío = listo). */
export function missingToStart(loadout: Loadout): string[] {
  const missing: string[] = [];
  const wheels = (['R1', 'R2', 'R3', 'R4'] as const).filter((s) => isWheel(loadout[s])).length;
  if (wheels < 4) missing.push(`Faltan ${4 - wheels} rueda${4 - wheels === 1 ? '' : 's'}`);
  if (!loadout.M) missing.push('Falta el motor');
  return missing;
}

export interface LoadoutEffects {
  shockAbsorber: boolean;
  bumper: boolean;
  railings: boolean;
  /** Las barandas convierten los estribos laterales en asientos: sin Contrapeso. */
  sideCounterweight: boolean;
  extraMassKg: number;
  /** Mayor = vuelca más fácil (ruedas grandes, barandas sobre el amortiguador). */
  tipRisk: number;
  /** Mayor = las lomas golpean más la carga. */
  bumpHarshness: number;
}

export function loadoutEffects(loadout: Loadout): LoadoutEffects {
  const big = (['R1', 'R2', 'R3', 'R4'] as const).filter((s) => loadout[s] === 'wheel_big').length;
  const railings = loadout.B === 'railings';
  const shock = loadout.C === 'shock_absorber';
  let extraMassKg = 0;
  for (const p of Object.values(loadout)) extraMassKg += (p && PIECE_MASS[p]) ?? 0;
  return {
    shockAbsorber: shock,
    bumper: loadout.D === 'bumper',
    railings,
    sideCounterweight: !railings,
    extraMassKg,
    tipRisk: 1 + big * 0.1 + (railings && shock ? 0.15 : 0),
    bumpHarshness: 1 + (4 - big) * 0.1,
  };
}
