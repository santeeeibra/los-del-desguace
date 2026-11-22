import { EXPEDITION_LEVEL_BY_ID, type ExpeditionLevelId } from './expeditionLevels';
import type { GameModeId } from './gameModes';

/**
 * Separación Sandbox/Dev vs MVP (ver docs/VISION_MVP.md).
 *
 * - El Dispensador infinito (`N`) y los presets de 1 clic son herramientas de `sandbox` o de desarrollo.
 * - En el MVP las piezas salen de pilas limitadas del patio, de desarmar autos y de la Mesa Láser.
 * - Flag de desarrollador: abrir el juego con `?dev=1` (queda guardado en el navegador); `?dev=0` lo apaga.
 */
const DEV_FLAG_KEY = 'desguace.devTools';

export function devToolsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('dev');
    if (param === '1') window.localStorage.setItem(DEV_FLAG_KEY, '1');
    else if (param === '0') window.localStorage.removeItem(DEV_FLAG_KEY);
    return window.localStorage.getItem(DEV_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** Dispensador de piezas (`N`, `SPAWNER_ITEMS`). */
export function dispenserAllowedFor(mode: GameModeId, activeLevelId: ExpeditionLevelId | null): boolean {
  if (devToolsEnabled()) return true;
  if (activeLevelId) {
    // Niveles viejos sin pilas propias siguen usando el dispensador hasta que se conviertan.
    return (EXPEDITION_LEVEL_BY_ID[activeLevelId].partsSource ?? 'dispenser') === 'dispenser';
  }
  return mode === 'sandbox';
}

/** Presets de 1 clic (`PRESET_BLUEPRINTS`). Nunca dentro de una expedición, salvo con el flag de desarrollador. */
export function presetsAllowedFor(mode: GameModeId, activeLevelId: ExpeditionLevelId | null): boolean {
  if (devToolsEnabled()) return true;
  return !activeLevelId && mode === 'sandbox';
}

/**
 * Umbral por defecto de las juntas rompibles en los niveles del MVP (piezas del patio):
 * la unión cede a `forceMultiple` veces el peso de la pieza o a `torqueAlpha` rad/s² de aceleración angular.
 * En Taller Libre y niveles viejos las soldaduras siguen sin romperse solas.
 */
export const MVP_JOINT_BREAK_DEFAULTS = { forceMultiple: 16, torqueAlpha: 600 } as const;

export function defaultJointBreakFor(activeLevelId: ExpeditionLevelId | null) {
  if (!activeLevelId) return undefined;
  return EXPEDITION_LEVEL_BY_ID[activeLevelId].partsSource === 'yard' ? MVP_JOINT_BREAK_DEFAULTS : undefined;
}
