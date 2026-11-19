import type { GrabbableKind } from '../props/grabbableRegistry';

export const INVENTORY_SIZE = 6;
export type InventoryKind = GrabbableKind | 'blueprint';

export interface InventoryItem {
  id: string;
  kind: InventoryKind;
  rotation: [number, number, number, number];
}

export type InventorySlots = readonly (InventoryItem | null)[];

export function emptyInventory(): InventorySlots {
  return Array<null>(INVENTORY_SIZE).fill(null);
}

export function placeInInventory(slots: InventorySlots, item: InventoryItem, preferred: number, exact: boolean) {
  if (!Number.isInteger(preferred) || preferred < 0 || preferred >= slots.length) return null;
  if (slots.some((entry) => entry?.id === item.id)) return null;
  const index = slots[preferred] === null ? preferred : exact ? -1 : slots.indexOf(null);
  if (index < 0) return null;
  const next = [...slots];
  next[index] = item;
  return { slots: next, index };
}
