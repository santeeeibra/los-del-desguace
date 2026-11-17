import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export type GrabbableKind = 'crate' | 'wheel' | 'canister' | 'part';

export interface CarryProfile {
  holdDistance: number;
  holdHeight: number;
  armSpread: number;
  armPitch: number;
  tiltX: number;
  dropRadius: number;
  dropHalfExtents: readonly [number, number, number];
  dropHeightOffset: number;
}

export const CARRY_PROFILES: Record<GrabbableKind, CarryProfile> = {
  crate: {
    holdDistance: 0.72,
    holdHeight: 0.14,
    armSpread: 0.34,
    armPitch: -1.32,
    tiltX: 0.05,
    dropRadius: 0.36,
    dropHalfExtents: [0.32, 0.3, 0.32],
    dropHeightOffset: 0.32,
  },
  wheel: {
    holdDistance: 0.72,
    holdHeight: 0.14,
    armSpread: 0.27,
    armPitch: -1.26,
    tiltX: 0.24,
    dropRadius: 0.38,
    dropHalfExtents: [0.16, 0.38, 0.38],
    dropHeightOffset: 0.4,
  },
  canister: {
    holdDistance: 0.62,
    holdHeight: 0.12,
    armSpread: 0.18,
    armPitch: -1.18,
    tiltX: 0.08,
    dropRadius: 0.25,
    dropHalfExtents: [0.23, 0.38, 0.23],
    dropHeightOffset: 0.4,
  },
  part: {
    holdDistance: 0.66,
    holdHeight: 0.12,
    armSpread: 0.24,
    armPitch: -1.24,
    tiltX: 0.1,
    dropRadius: 0.3,
    dropHalfExtents: [0.27, 0.23, 0.23],
    dropHeightOffset: 0.26,
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
  readonly carriedVisualPos = new THREE.Vector3();
  readonly carriedVisualQuat = new THREE.Quaternion();

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
