import { useSyncExternalStore } from 'react';

/**
 * Estado de desgaste de las piezas rescatadas (ver docs/VISION_MVP.md, 3.3).
 * - Motor `broken`: rinde muy poco y chispea hasta repararlo en el Banco RPM (`Tab`).
 * - Batería `discharged`: no entrega energía hasta recargarla con la Pinza de Cables (`5`) en un generador.
 * Una pieza sin entrada está en `ok`.
 */
export type PartCondition = 'ok' | 'broken' | 'discharged';

/** Un motor roto entrega este porcentaje de su potencia. */
export const BROKEN_ENGINE_FACTOR = 0.25;

const conditions = new Map<string, PartCondition>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function getPartCondition(id: string): PartCondition {
  return conditions.get(id) ?? 'ok';
}

export function setPartCondition(id: string, condition: PartCondition): void {
  if (getPartCondition(id) === condition) return;
  if (condition === 'ok') conditions.delete(id);
  else conditions.set(id, condition);
  emit();
}

/** Ids de piezas en un estado dado (por ejemplo, todos los motores rotos). */
export function partIdsWithCondition(condition: Exclude<PartCondition, 'ok'>): string[] {
  const ids: string[] = [];
  for (const [id, value] of conditions) if (value === condition) ids.push(id);
  return ids;
}

export function resetPartConditions(): void {
  if (conditions.size === 0) return;
  conditions.clear();
  emit();
}

/** Multiplicador de potencia de un motor según su estado. */
export function engineConditionFactor(id: string): number {
  return getPartCondition(id) === 'broken' ? BROKEN_ENGINE_FACTOR : 1;
}

export function subscribePartConditions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Para componentes React: se vuelve a renderizar cuando cambia el estado de cualquier pieza. */
export function usePartConditionVersion(): number {
  return useSyncExternalStore(subscribePartConditions, () => version, () => version);
}
