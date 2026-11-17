import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';
import type * as THREE from 'three';

export type GrabbableKind = 'crate' | 'wheel' | 'canister';

export interface GrabbableEntry {
  id: string;
  kind: GrabbableKind;
  initialPos: [number, number, number];
  getBody: () => RapierRigidBody | null;
  getCollider: () => RapierCollider | null;
  getWorldPos: (out: THREE.Vector3) => boolean;
}

class GrabbableRegistry {
  private entries = new Map<string, GrabbableEntry>();
  highlightedId: string | null = null;
  carriedId: string | null = null;

  register(entry: GrabbableEntry) {
    this.entries.set(entry.id, entry);
  }

  unregister(id: string) {
    this.entries.delete(id);
    if (this.highlightedId === id) this.highlightedId = null;
    if (this.carriedId === id) this.carriedId = null;
  }

  getAll(): IterableIterator<GrabbableEntry> {
    return this.entries.values();
  }

  getById(id: string): GrabbableEntry | undefined {
    return this.entries.get(id);
  }
}

export const grabbableRegistry = new GrabbableRegistry();
