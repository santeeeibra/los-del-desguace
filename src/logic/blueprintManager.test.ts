import { describe, expect, it } from 'vitest';
import {
  PRESET_BLUEPRINTS,
  createBlueprint,
  decodeBlueprintCode,
  deleteBlueprint,
  encodeBlueprintCode,
  listBlueprints,
  saveBlueprint,
  type StorageLike,
} from './blueprintManager';
import { LogicGraph } from './logicGraph';

function makeMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('blueprintManager', () => {
  it('captura, guarda, lista y elimina blueprints con lógica incluida', () => {
    const storage = makeMemoryStorage();
    const graph = new LogicGraph();
    graph.addNode('battery-1', 'battery', { charge: 1 }, { bodyId: 'battery-1' });
    graph.addNode('thruster-1', 'thruster', { gain: 1 }, { bodyId: 'thruster-1' });
    graph.connect('battery-1', 'thruster-1');

    const bp = createBlueprint(
      'Cohete Loco',
      [
        {
          partId: 'thruster-1',
          kind: 'thruster',
          slotId: 'rack_rear',
          localPos: [0, 0.68, -1.05],
          localRot: [0, 0, 0, 1],
        },
      ],
      graph
    );

    saveBlueprint(bp, storage);
    const loaded = listBlueprints(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Cohete Loco');
    expect(loaded[0].logic.wires).toHaveLength(1);

    const restoredGraph = LogicGraph.fromJSON(loaded[0].logic);
    restoredGraph.evaluate(0.016);
    restoredGraph.evaluate(0.016);
    expect(restoredGraph.getOutput('thruster-1')).toBe(1);

    const afterDelete = deleteBlueprint(bp.id, storage);
    expect(afterDelete).toHaveLength(0);
  });

  it('incluye presets válidos listos para spawnear', () => {
    expect(PRESET_BLUEPRINTS.length).toBeGreaterThanOrEqual(2);
    for (const preset of PRESET_BLUEPRINTS) {
      const g = LogicGraph.fromJSON(preset.logic);
      expect(g.getNodes().length).toBeGreaterThan(0);
      expect(preset.parts.length).toBeGreaterThan(0);
    }
  });

  it('conserva pintura del aerosol y variante de carrocería al codificar/decodificar URL', () => {
    const graph = new LogicGraph();
    const bp = createBlueprint(
      'Cuña Pintada',
      [
        {
          partId: 'extra-bodywork-panel_wedge-1',
          kind: 'bodywork',
          slotId: 'free:cart:1',
          localPos: [0, 0.5, 1.1],
          localRot: [0, 0, 0, 1],
          paint: '#a63d24',
          bodyworkKind: 'panel_wedge',
        },
      ],
      graph,
    );
    const decoded = decodeBlueprintCode(encodeBlueprintCode(bp));
    expect(decoded).not.toBeNull();
    expect(decoded!.parts[0].paint).toBe('#a63d24');
    expect(decoded!.parts[0].bodyworkKind).toBe('panel_wedge');
  });
});
