import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export type GrabbableKind =
  | 'crate'
  | 'wheel'
  | 'canister'
  | 'part'
  | 'battery'
  | 'woodBarrel'
  | 'wing'
  | 'headlight'
  | 'seat'
  | 'thruster'
  | 'timerBox'
  | 'switchBox'
  | 'logicAnd'
  | 'magnet'
  | 'chassis'
  | 'cargoRack'
  | 'spring'
  | 'balloon'
  | 'fan'
  | 'horn'
  | 'gyro'
  | 'boxingGlove'
  | 'droneRotor'
  | 'flag';

export const NEW_PROP_BOUNDS = {
  boxingGlove: [0.17, 0.16, 0.3],
  droneRotor: [0.28, 0.11, 0.28],
  flag: [0.19, 0.36, 0.06],
} as const;

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
    holdHeight: -0.02,
    armSpread: 0.34,
    armPitch: -1.04,
    tiltX: 0.05,
    dropRadius: 0.36,
    dropHalfExtents: [0.32, 0.3, 0.32],
    dropHeightOffset: 0.32,
  },
  wheel: {
    holdDistance: 0.74,
    holdHeight: -0.07,
    armSpread: 0.27,
    armPitch: -1.0,
    tiltX: 0.24,
    dropRadius: 0.38,
    dropHalfExtents: [0.16, 0.38, 0.38],
    dropHeightOffset: 0.4,
  },
  canister: {
    holdDistance: 0.68,
    holdHeight: -0.08,
    armSpread: 0.19,
    armPitch: -0.98,
    tiltX: 0.08,
    dropRadius: 0.25,
    dropHalfExtents: [0.23, 0.38, 0.23],
    dropHeightOffset: 0.4,
  },
  part: {
    holdDistance: 0.68,
    holdHeight: 0.0,
    armSpread: 0.24,
    armPitch: -1.0,
    tiltX: 0.1,
    dropRadius: 0.3,
    dropHalfExtents: [0.27, 0.23, 0.23],
    dropHeightOffset: 0.26,
  },
  battery: {
    holdDistance: 0.68, holdHeight: 0, armSpread: 0.24, armPitch: -1, tiltX: 0.1,
    dropRadius: 0.3, dropHalfExtents: [0.27, 0.23, 0.23], dropHeightOffset: 0.26,
  },
  woodBarrel: {
    holdDistance: 0.9, holdHeight: -0.07, armSpread: 0.35, armPitch: -0.95, tiltX: 0.06,
    dropRadius: 0.37, dropHalfExtents: [0.36, 0.48, 0.36], dropHeightOffset: 0.51,
  },
  wing: {
    holdDistance: 0.85, holdHeight: 0.05, armSpread: 0.38, armPitch: -0.95, tiltX: 0.05,
    dropRadius: 0.56, dropHalfExtents: [0.55, 0.08, 0.24], dropHeightOffset: 0.14,
  },
  headlight: {
    holdDistance: 0.62, holdHeight: 0.02, armSpread: 0.2, armPitch: -1.0, tiltX: 0.08,
    dropRadius: 0.22, dropHalfExtents: [0.16, 0.17, 0.16], dropHeightOffset: 0.2,
  },
  seat: {
    holdDistance: 0.78, holdHeight: -0.04, armSpread: 0.3, armPitch: -0.98, tiltX: 0.06,
    dropRadius: 0.34, dropHalfExtents: [0.25, 0.31, 0.26], dropHeightOffset: 0.34,
  },
  thruster: {
    holdDistance: 0.72, holdHeight: -0.05, armSpread: 0.22, armPitch: -0.98, tiltX: 0.08,
    dropRadius: 0.24, dropHalfExtents: [0.17, 0.34, 0.17], dropHeightOffset: 0.36,
  },
  timerBox: {
    holdDistance: 0.62, holdHeight: 0.02, armSpread: 0.2, armPitch: -1.0, tiltX: 0.06,
    dropRadius: 0.22, dropHalfExtents: [0.18, 0.14, 0.18], dropHeightOffset: 0.18,
  },
  switchBox: {
    holdDistance: 0.62, holdHeight: 0.02, armSpread: 0.2, armPitch: -1.0, tiltX: 0.06,
    dropRadius: 0.22, dropHalfExtents: [0.18, 0.14, 0.18], dropHeightOffset: 0.18,
  },
  logicAnd: {
    holdDistance: 0.62, holdHeight: 0.02, armSpread: 0.2, armPitch: -1.0, tiltX: 0.06,
    dropRadius: 0.22, dropHalfExtents: [0.18, 0.14, 0.18], dropHeightOffset: 0.18,
  },
  magnet: {
    holdDistance: 0.66, holdHeight: 0.0, armSpread: 0.22, armPitch: -1.0, tiltX: 0.06,
    dropRadius: 0.25, dropHalfExtents: [0.22, 0.16, 0.22], dropHeightOffset: 0.2,
  },
  chassis: {
    holdDistance: 1.05, holdHeight: -0.06, armSpread: 0.42, armPitch: -0.92, tiltX: 0.04,
    dropRadius: 0.72, dropHalfExtents: [0.55, 0.08, 0.95], dropHeightOffset: 0.14,
  },
  cargoRack: {
    holdDistance: 0.8, holdHeight: -0.04, armSpread: 0.34, armPitch: -0.96, tiltX: 0.05,
    dropRadius: 0.48, dropHalfExtents: [0.46, 0.12, 0.36], dropHeightOffset: 0.16,
  },
  spring: {
    holdDistance: 0.64, holdHeight: 0.0, armSpread: 0.22, armPitch: -1.0, tiltX: 0.06,
    dropRadius: 0.24, dropHalfExtents: [0.2, 0.24, 0.2], dropHeightOffset: 0.26,
  },
  balloon: {
    holdDistance: 0.72, holdHeight: 0.14, armSpread: 0.26, armPitch: -0.9, tiltX: 0.04,
    dropRadius: 0.34, dropHalfExtents: [0.3, 0.36, 0.3], dropHeightOffset: 0.42,
  },
  fan: {
    holdDistance: 0.68, holdHeight: 0.0, armSpread: 0.24, armPitch: -0.98, tiltX: 0.08,
    dropRadius: 0.28, dropHalfExtents: [0.26, 0.18, 0.26], dropHeightOffset: 0.22,
  },
  horn: {
    holdDistance: 0.62, holdHeight: 0.04, armSpread: 0.2, armPitch: -1.0, tiltX: 0.08,
    dropRadius: 0.22, dropHalfExtents: [0.18, 0.16, 0.24], dropHeightOffset: 0.2,
  },
  gyro: {
    holdDistance: 0.64, holdHeight: 0.02, armSpread: 0.22, armPitch: -1.0, tiltX: 0.06,
    dropRadius: 0.24, dropHalfExtents: [0.22, 0.22, 0.22], dropHeightOffset: 0.24,
  },
  boxingGlove: {
    holdDistance: 0.7, holdHeight: 0, armSpread: 0.2, armPitch: -1, tiltX: 0,
    dropRadius: 0.3, dropHalfExtents: NEW_PROP_BOUNDS.boxingGlove, dropHeightOffset: 0.19,
  },
  droneRotor: {
    holdDistance: 0.71, holdHeight: 0, armSpread: 0.24, armPitch: -1, tiltX: 0,
    dropRadius: 0.28, dropHalfExtents: NEW_PROP_BOUNDS.droneRotor, dropHeightOffset: 0.14,
  },
  flag: {
    holdDistance: 0.68, holdHeight: 0, armSpread: 0.16, armPitch: -1, tiltX: 0,
    dropRadius: 0.2, dropHalfExtents: NEW_PROP_BOUNDS.flag, dropHeightOffset: 0.39,
  },
};

export interface GrabbableEntry {
  id: string;
  kind: GrabbableKind;
  initialPos: [number, number, number];
  getBody: () => RapierRigidBody | null;
  getCollider: () => RapierCollider | null;
  getVisualGroup: () => THREE.Group | null;
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
