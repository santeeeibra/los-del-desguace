import { beforeEach, describe, expect, it } from 'vitest';
import {
  PRESET_BLUEPRINTS,
  decodeBlueprintCode,
  encodeBlueprintCode,
} from '../src/logic/blueprintManager';
import { WORKSHOP_CONTRACTS, contractStore } from '../src/modes/contracts';

describe('contracts & blueprint sharing', () => {
  beforeEach(() => {
    contractStore.clearContract();
    contractStore.setBrokenWelds(0, false);
  });

  it('WORKSHOP_CONTRACTS tiene 13 contratos distintos desde first-drive hasta poly-bridge', () => {
    expect(WORKSHOP_CONTRACTS).toHaveLength(13);
    const ids = WORKSHOP_CONTRACTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(13);
    expect(ids).toEqual([
      'first-drive',
      'west-freight',
      'ramp-climb',
      'yard-bumps',
      'speed-lap',
      'air-ring',
      'stunt-ramp',
      'balloon-sky',
      'barrel-smash',
      'no-wheels',
      'robot-arena',
      'aerial-duel',
      'poly-bridge',
    ]);
  });

  it('startContract y tickContract completan first-drive al alcanzar su objetivo y otorgan 1-3 tuercas', () => {
    const firstDrive = WORKSHOP_CONTRACTS.find((c) => c.id === 'first-drive')!;
    contractStore.startContract('first-drive');

    expect(contractStore.getState().activeContractId).toBe('first-drive');
    expect(contractStore.getState().completedNow).toBe(false);

    // Tick far from target: should not complete
    contractStore.tickContract(0.05, { x: 0, y: 0, z: 0 });
    expect(contractStore.getState().completedNow).toBe(false);

    // Tick at target position: should complete and award 1..3 nuts
    const [tx, ty, tz] = firstDrive.targetPos;
    contractStore.tickContract(0.05, { x: tx, y: ty, z: tz });

    const after = contractStore.getState();
    expect(after.completedNow).toBe(true);
    expect(after.lastNutsEarned).toBeGreaterThanOrEqual(1);
    expect(after.lastNutsEarned).toBeLessThanOrEqual(3);
    expect(after.progress['first-drive']?.bestNuts).toBe(after.lastNutsEarned);
    contractStore.startContract('first-drive');
    contractStore.tickContract(0.05, { x: tx, y: ty, z: tz });
    expect(contractStore.getState().completedNow).toBe(false);
    contractStore.tickContract(0.05, { x: tx + firstDrive.hitRadius + 1, y: ty, z: tz });
    contractStore.tickContract(0.05, { x: tx, y: ty, z: tz });
    expect(contractStore.getState().completedNow).toBe(true);
  });

  it.each([
    ['no-wheels', { wheels: 1, displacedBarrels: 0 }, { wheels: 0, displacedBarrels: 0 }],
    ['barrel-smash', { wheels: 4, displacedBarrels: 1 }, { wheels: 4, displacedBarrels: 2 }],
  ] as const)('exige el objetivo de %s además de llegar a la meta', (id, incomplete, complete) => {
    const contract = WORKSHOP_CONTRACTS.find((entry) => entry.id === id)!;
    const [x, y, z] = contract.targetPos;
    contractStore.startContract(id);
    contractStore.tickContract(0.05, { x: x + contract.hitRadius + 1, y, z }, incomplete);
    contractStore.tickContract(0.05, { x, y, z }, incomplete);
    expect(contractStore.getState().completedNow).toBe(false);
    contractStore.tickContract(0.05, { x, y, z }, complete);
    expect(contractStore.getState().completedNow).toBe(true);
  });

  it('encodeBlueprintCode y decodeBlueprintCode hacen roundtrip en presets 0 y 9 y rechazan códigos inválidos', () => {
    const p0 = PRESET_BLUEPRINTS[0];
    const p9 = PRESET_BLUEPRINTS[9];
    expect(p0).toBeDefined();
    expect(p9).toBeDefined();

    for (const preset of [p0, p9]) {
      const code = encodeBlueprintCode(preset);
      const decoded = decodeBlueprintCode(code);
      expect(decoded).not.toBeNull();
      expect(decoded!.name).toBe(preset.name);
      expect(decoded!.parts).toEqual(preset.parts);
      expect(decoded!.logic).toEqual(preset.logic);
      expect(decodeBlueprintCode(`https://example.test/?bp=${encodeURIComponent(code)}`)?.parts).toEqual(preset.parts);
    }

    expect(decodeBlueprintCode('')).toBeNull();
    expect(decodeBlueprintCode('   ')).toBeNull();
    expect(decodeBlueprintCode('not-a-valid-blueprint-code!!!')).toBeNull();
    expect(decodeBlueprintCode('LDG1_invalid_base64')).toBeNull();
    const malformed = { ...p9, logic: { ...p9.logic, nodes: [null] } };
    expect(decodeBlueprintCode(encodeBlueprintCode(malformed as unknown as typeof p9))).toBeNull();
  });
});
