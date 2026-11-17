import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';
import type * as THREE from 'three';

export type GrabbableKind = 'crate' | 'wheel' | 'canister' | 'part';

export interface CarryProfile {
  holdDistance: number;
  holdHeight: number;
  armSpread: number;
  armPitch: number;
  tiltX: number;
  dropRadius: number;
  dropHeightOffset: number;
}

export const CARRY_PROFILES: Record<GrabbableKind, CarryProfile> = {
  crate: {
    holdDistance: 0.68,
    holdHeight: 0.14,
    armSpread: 0.34,
    armPitch: -1.32,
    tiltX: 0.05,
    dropRadius: 0.38,
    dropHeightOffset: 0.22,
  },
  wheel: {
    holdDistance: 0.64,
    holdHeight: 0.12,
    armSpread: 0.27,
    armPitch: -1.26,
    tiltX: 0.24,
    dropRadius: 0.4,
    dropHeightOffset: 0.24,
  },
  canister: {
    holdDistance: 0.56,
    holdHeight: 0.1,
    armSpread: 0.18,
    armPitch: -1.18,
    tiltX: 0.08,
    dropRadius: 0.3,
    dropHeightOffset: 0.25,
  },
  part: {
    holdDistance: 0.6,
    holdHeight: 0.11,
    armSpread: 0.24,
    armPitch: -1.24,
    tiltX: 0.1,
    dropRadius: 0.34,
    dropHeightOffset: 0.22,
  },
};

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
