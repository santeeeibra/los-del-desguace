/**
 * Corte en vivo con la sierra láser. Estado mutable que escribe PlayerRig (cada frame) y lee la
 * escena para dibujar la línea trazada, el material al rojo y el frente de corte con chispas.
 */
import { Vector3 } from 'three';

export type LiveCutPhase = 'idle' | 'trace' | 'cut';

export const liveCut = {
  phase: 'idle' as LiveCutPhase,
  targetId: null as string | null,
  /** Inicio de la línea trazada sobre la pieza. */
  a: new Vector3(),
  /** Fin de la línea (sigue al láser mientras se traza). */
  b: new Vector3(),
  /** Frente de corte: avanza de A a B mientras corta. */
  front: new Vector3(),
  /** 0–1 del recorrido del corte. */
  progress: 0,
  /** Segundos desde que terminó el último corte (para el destello final). */
  sinceDone: 99,
  reset() {
    this.phase = 'idle';
    this.targetId = null;
    this.progress = 0;
  },
};
