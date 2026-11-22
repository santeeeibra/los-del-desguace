import { beforeEach, describe, expect, it } from 'vitest';
import {
  EXPEDITION_LEVELS,
  expeditionStore,
  localToWorld,
  mudDragMultiplier,
  windGustFactor,
} from '../src/modes/expeditionLevels';

describe('Niveles de Expedición (1–4)', () => {
  beforeEach(() => {
    expeditionStore.resetForTests();
  });

  it('define 4 niveles extensos en sectores aislados sin superponerse con el taller', () => {
    expect(EXPEDITION_LEVELS).toHaveLength(4);
    for (const lvl of EXPEDITION_LEVELS) {
      expect(lvl.origin[0]).toBeGreaterThanOrEqual(140);
      expect(lvl.checkpointsLocal.length).toBeGreaterThanOrEqual(2);
      expect(lvl.goalLocal[2]).toBeGreaterThanOrEqual(90);
    }
  });

  it('inicia un nivel, avanza checkpoints, respawnea en el último punto y guarda mejor tiempo + Tuerca Dorada', () => {
    expeditionStore.startLevel('level-1-swamp');
    const s0 = expeditionStore.getState();
    expect(s0.activeLevelId).toBe('level-1-swamp');
    expect(s0.checkpointIndex).toBe(0);
    expect(s0.teleportRequest?.pos).toEqual(localToWorld(EXPEDITION_LEVELS[0].origin, EXPEDITION_LEVELS[0].spawnLocal));

    for (let i = 0; i < 124; i++) expeditionStore.tick(0.1);
    expeditionStore.reachCheckpoint(1);
    expect(expeditionStore.getState().checkpointIndex).toBe(1);

    // Respawnear teletransporta al checkpoint 1
    expeditionStore.respawnAtCheckpoint();
    expect(expeditionStore.getState().teleportRequest?.pos).toEqual(
      localToWorld(EXPEDITION_LEVELS[0].origin, EXPEDITION_LEVELS[0].checkpointsLocal[0]),
    );

    // Recolectar Tuerca Dorada y completar
    expeditionStore.collectGoldenNut();
    expeditionStore.completeActiveLevel();
    const done = expeditionStore.getState();
    expect(done.completedNow).toBe(true);
    expect(done.progress['level-1-swamp'].completed).toBe(true);
    expect(done.progress['level-1-swamp'].goldenNut).toBe(true);
    expect(done.progress['level-1-swamp'].bestTimeSec).toBeCloseTo(12.4, 1);

    // Volver al taller limpia el nivel activo y teletransporta de regreso
    expeditionStore.exitToWorkshop();
    expect(expeditionStore.getState().activeLevelId).toBeNull();
  });

  it('windGustFactor alterna ventanas de calma (0) y ráfagas suaves (0..1) y mudDragMultiplier frena progresivamente', () => {
    expect(windGustFactor(0.5)).toBe(0);
    expect(windGustFactor(3.7)).toBeGreaterThan(0.95);
    expect(windGustFactor(5.6)).toBe(0);

    const drag = mudDragMultiplier(1 / 60, 4.8);
    expect(drag).toBeGreaterThan(0.85);
    expect(drag).toBeLessThan(1);
  });
});
