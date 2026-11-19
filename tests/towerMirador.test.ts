import { describe, expect, it } from 'vitest';
import { TOWER_DECK_HEIGHT, TOWER_ORIGIN, TOWER_STEPS, isInTowerNutReach } from '../src/modes/towerMirador';
import { gameStore } from '../src/state/gameStore';

describe('Torre Mirador', () => {
  it('tiene una ruta de saltos cortos desde el suelo hasta el mirador', () => {
    const heights = [0, ...TOWER_STEPS.map(({ top }) => top), TOWER_DECK_HEIGHT];
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i] - heights[i - 1]).toBeGreaterThan(0);
      expect(heights[i] - heights[i - 1]).toBeLessThanOrEqual(0.41);
    }
  });

  it('entrega la tuerca solo cerca de la cubierta y desbloquea la paleta una vez', () => {
    const [x, , z] = TOWER_ORIGIN;
    expect(isInTowerNutReach({ x, y: 1, z })).toBe(false);
    expect(isInTowerNutReach({ x: x + 2, y: TOWER_DECK_HEIGHT + 1, z })).toBe(false);
    expect(isInTowerNutReach({ x, y: TOWER_DECK_HEIGHT + 4, z })).toBe(false);
    expect(isInTowerNutReach({ x, y: TOWER_DECK_HEIGHT + 0.8, z })).toBe(true);
    expect(isInTowerNutReach({ x, y: TOWER_DECK_HEIGHT + 2, z })).toBe(true);

    gameStore.setCharacterConfig({ colorPresetId: 'mirador' });
    expect(gameStore.getState().characterConfig.colorPresetId).not.toBe('mirador');
    expect(gameStore.collectTowerNut()).toBe(true);
    expect(gameStore.collectTowerNut()).toBe(false);
    gameStore.triggerReset();
    expect(gameStore.getState().towerNutFound).toBe(true);
    gameStore.setCharacterConfig({ colorPresetId: 'mirador' });
    expect(gameStore.getState().characterConfig.colorPresetId).toBe('mirador');
  });
});
