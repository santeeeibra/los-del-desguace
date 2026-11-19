import { beforeEach, describe, expect, it } from 'vitest';
import { PRESET_BLUEPRINTS } from '../src/logic/blueprintManager';
import {
  arenaAndBridgeStore,
  BRIDGE_GOAL_POS,
  getDroneWorldPosition,
  isOutsideRobotArena,
  ROBOT_ARENA_CENTER,
} from '../src/modes/arenaAndBridge';
import { contractStore, WORKSHOP_CONTRACTS } from '../src/modes/contracts';

describe('Prioridad 4: Arenas de Combate y Circuito Poly Bridge', () => {
  beforeEach(() => {
    contractStore.clearContract();
    arenaAndBridgeStore.reset();
  });

  it('expone los 3 encargos nuevos y los 2 presets de combate/vuelo', () => {
    const ids = WORKSHOP_CONTRACTS.map((c) => c.id);
    expect(ids).toContain('robot-arena');
    expect(ids).toContain('aerial-duel');
    expect(ids).toContain('poly-bridge');

    const presetIds = PRESET_BLUEPRINTS.map((p) => p.id);
    expect(presetIds).toContain('preset-ram-bot');
    expect(presetIds).toContain('preset-sky-fighter');
  });

  it('detecta salida de la Arena del Yunke y completa robot-arena al sacar a los 2 rivales', () => {
    expect(isOutsideRobotArena(ROBOT_ARENA_CENTER[0], 0.8, ROBOT_ARENA_CENTER[2])).toBe(false);
    expect(isOutsideRobotArena(ROBOT_ARENA_CENTER[0] + 10, 0.8, ROBOT_ARENA_CENTER[2])).toBe(true);

    contractStore.startContract('robot-arena');
    expect(arenaAndBridgeStore.markRobotKnockedOut('rival-bot-1')).toBe(true);
    contractStore.tickContract(0.5, { x: ROBOT_ARENA_CENTER[0], y: 0.8, z: ROBOT_ARENA_CENTER[2] });
    expect(contractStore.getState().completedNow).toBe(false);

    expect(arenaAndBridgeStore.markRobotKnockedOut('rival-bot-2')).toBe(true);
    contractStore.tickContract(0.5, { x: ROBOT_ARENA_CENTER[0], y: 0.8, z: ROBOT_ARENA_CENTER[2] });
    expect(contractStore.getState().completedNow).toBe(true);
  });

  it('derriba drones en Duelo Aéreo al interceptarlos y completa aerial-duel', () => {
    contractStore.startContract('aerial-duel');
    for (const drone of arenaAndBridgeStore.getState().drones) {
      const [dx, dy, dz] = getDroneWorldPosition(drone);
      arenaAndBridgeStore.stepDrones(0.016, { x: dx, y: dy, z: dz });
    }
    expect(arenaAndBridgeStore.getState().dronesDestroyed).toBe(3);

    contractStore.tickContract(0.5, { x: 9.5, y: 8.8, z: 20.0 });
    expect(contractStore.getState().completedNow).toBe(true);
  });

  it('controla el estrés e integridad del puente y bloquea victoria si colapsó', () => {
    contractStore.startContract('poly-bridge');
    for (let i = 0; i < 420; i++) {
      arenaAndBridgeStore.updateBridgeStress(1.4, 1 / 60);
    }
    expect(arenaAndBridgeStore.getState().bridgeCollapsed).toBe(true);

    contractStore.tickContract(0.2, {
      x: BRIDGE_GOAL_POS[0],
      y: BRIDGE_GOAL_POS[1],
      z: BRIDGE_GOAL_POS[2],
    });
    expect(contractStore.getState().completedNow).toBe(false);

    // Al reiniciar, el puente vuelve a 100% y permite cruzar y completar
    contractStore.startContract('poly-bridge');
    expect(arenaAndBridgeStore.getState().bridgeIntegrity).toBe(100);
    expect(arenaAndBridgeStore.getState().bridgeCollapsed).toBe(false);
    for (let i = 0; i < 60; i++) arenaAndBridgeStore.updateBridgeStress(1, 1 / 60);
    expect(arenaAndBridgeStore.getState().bridgeIntegrity).toBeLessThan(100);
    for (let i = 0; i < 60; i++) arenaAndBridgeStore.updateBridgeStress(0, 1 / 60);
    expect(arenaAndBridgeStore.getState().bridgeIntegrity).toBe(100);

    contractStore.tickContract(0.2, {
      x: BRIDGE_GOAL_POS[0],
      y: BRIDGE_GOAL_POS[1],
      z: BRIDGE_GOAL_POS[2],
    });
    expect(contractStore.getState().completedNow).toBe(false);
    for (const z of [24.5, 29, 33, BRIDGE_GOAL_POS[2]]) {
      contractStore.tickContract(1 / 60, { x: BRIDGE_GOAL_POS[0], y: 1, z });
    }
    expect(contractStore.getState().completedNow).toBe(true);
  });
});
