import type { GrabbableKind } from '../props/grabbableRegistry';
import type { PlatformTemplate, Pt } from './platformShape';

export interface PlatformChildInfo {
  id: string;
  kind: GrabbableKind;
  /** Pose relativa a la plataforma (metros, +Z = frente). */
  pose: { position: { x: number; y: number; z: number }; axis?: { x: number; y: number; z: number } };
  steer: { min: number; max: number; angle: number } | null;
}

export interface PlatformInfo {
  id: string;
  /** La plataforma forma parte de una creación soldada. */
  inAssembly: boolean;
  /** La creación está suelta (andando): hay que fijarla para recortar. */
  released: boolean;
  carried: boolean;
  children: PlatformChildInfo[];
}

export interface LaserTableHandlers {
  info(id: string): PlatformInfo | null;
  fabricate(template: PlatformTemplate, outline: Pt[]): { id?: string; error?: string };
  cut(id: string, cut: Pt[]): { error?: string; released?: string[] };
  undo(id: string): { error?: string; restored?: number };
  /** Plataforma a la que apunta o tiene cerca el jugador, si hay. */
  aimed(): string | null;
}

let handlers: LaserTableHandlers | null = null;

/** Conecta el HUD de la Mesa de Corte con el taller (lo registra PlayerRig). */
export const laserTableBridge = {
  register(next: LaserTableHandlers) {
    handlers = next;
    return () => { if (handlers === next) handlers = null; };
  },
  get(): LaserTableHandlers | null {
    return handlers;
  },
};
