/**
 * Trozos: piezas que salen de rebanar otra pieza. Cada trozo es un cuerpo convexo (casco de puntos,
 * centrado en su centro de masa) con masa proporcional al volumen. Esta store guarda esos datos y
 * qué piezas originales se consumieron al cortarlas (para ocultarlas y devolverlas al limpiar).
 */
import { useSyncExternalStore } from 'react';
import type { CutPlane, V3 } from './sliceGeometry';
import type { GrabbableKind } from '../props/grabbableRegistry';

export interface FragmentRecord {
  id: string;
  /** Puntos del casco convexo, relativos al centro de masa del trozo. */
  points: V3[];
  /** Planos de todos los cortes que dieron forma al trozo (para pintar las caras del tajo). */
  cutPlanes: CutPlane[];
  /** Planos orientados para Three.js clippingPlanes (n·p + d >= 0 es el lado conservado). */
  clipPlanes?: CutPlane[];
  /** Posición del origen de la pieza original en coordenadas locales del trozo (para recortar el modelo 3D real). */
  sourceOffset?: V3;
  /** Rotación de la pieza original en coordenadas locales del trozo. */
  sourceQuat?: [number, number, number, number];
  mass: number;
  sourceKind: GrabbableKind;
  base: [number, number, number];
  cut: [number, number, number];
}

const fragments = new Map<string, FragmentRecord>();
const consumed = new Set<string>();
const listeners = new Set<() => void>();
let nonce = 0;

function emit() {
  nonce++;
  for (const l of listeners) l();
}

/** Colores del material según la pieza de origen (base del trozo, cara del tajo). */
const WOOD: [number, number, number] = [0.62, 0.38, 0.17];
const WOOD_CUT: [number, number, number] = [0.93, 0.78, 0.52];
const METAL: [number, number, number] = [0.46, 0.5, 0.53];
const METAL_CUT: [number, number, number] = [0.86, 0.88, 0.9];
const KIND_COLORS: Partial<Record<GrabbableKind, { base: [number, number, number]; cut: [number, number, number] }>> = {
  crate: { base: WOOD, cut: WOOD_CUT },
  woodBarrel: { base: WOOD, cut: WOOD_CUT },
  chassis: { base: WOOD, cut: WOOD_CUT },
  cargoRack: { base: WOOD, cut: WOOD_CUT },
  platform: { base: [0.7, 0.47, 0.22], cut: WOOD_CUT },
  wheel: { base: [0.14, 0.14, 0.15], cut: [0.24, 0.22, 0.21] },
  part: { base: [0.72, 0.25, 0.2], cut: METAL_CUT },
  canister: { base: [0.18, 0.5, 0.5], cut: METAL_CUT },
  battery: { base: [0.3, 0.32, 0.34], cut: METAL_CUT },
};

export function fragmentColors(kind: GrabbableKind) {
  return KIND_COLORS[kind] ?? { base: METAL, cut: METAL_CUT };
}

export const fragmentStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getNonce() { return nonce; },
  create(record: FragmentRecord) {
    fragments.set(record.id, record);
    emit();
  },
  get(id: string) { return fragments.get(id); },
  consume(id: string) {
    consumed.add(id);
    emit();
  },
  isConsumed(id: string) { return consumed.has(id); },
  hasConsumed() { return consumed.size > 0; },
  /** Devuelve las piezas originales (se llama al quitar todos los trozos). */
  restoreAll() {
    if (!consumed.size) return;
    consumed.clear();
    emit();
  },
  forget(id: string) {
    if (fragments.delete(id)) emit();
  },
};

/** Re-renderiza cuando cambian los trozos o las piezas consumidas. */
export function useFragmentNonce() {
  return useSyncExternalStore(fragmentStore.subscribe, fragmentStore.getNonce);
}
