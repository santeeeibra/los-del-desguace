import { describe, expect, it } from 'vitest';
import { LogicGraph } from './logicGraph';

describe('LogicGraph', () => {
  it('alimenta un motor solo cuando batería e interruptor están activos (AND / power)', () => {
    const g = new LogicGraph();
    g.addNode('bat', 'battery', { charge: 1 });
    g.addNode('sw', 'switch', { active: false });
    g.addNode('mot', 'motor');

    g.connect('bat', 'mot', { toPort: 'power' });
    g.connect('sw', 'mot', { toPort: 'signal' });

    g.evaluate(0.016);
    g.evaluate(0.016);
    expect(g.getOutput('bat')).toBe(1);
    expect(g.getOutput('mot')).toBe(0);

    g.toggleSwitch('sw');
    g.evaluate(0.016);
    g.evaluate(0.016);
    expect(g.getOutput('mot')).toBe(1);
  });

  it('soporta puertas AND, OR, NOT, XOR e INVERT', () => {
    const g = new LogicGraph();
    g.addNode('a', 'switch', { active: true });
    g.addNode('b', 'switch', { active: false });
    g.addNode('and', 'and');
    g.addNode('or', 'or');
    g.addNode('notB', 'not');
    g.addNode('xor', 'xor');
    g.addNode('inv', 'invert');

    g.connect('a', 'and', { toPort: 'a' });
    g.connect('b', 'and', { toPort: 'b' });
    g.connect('a', 'or', { toPort: 'a' });
    g.connect('b', 'or', { toPort: 'b' });
    g.connect('b', 'notB');
    g.connect('a', 'xor', { toPort: 'a' });
    g.connect('b', 'xor', { toPort: 'b' });
    g.connect('a', 'inv');

    g.evaluate(0.016);
    g.evaluate(0.016);

    expect(g.getOutput('and')).toBe(0);
    expect(g.getOutput('or')).toBe(1);
    expect(g.getOutput('notB')).toBe(1);
    expect(g.getOutput('xor')).toBe(1);
    expect(g.getOutput('inv')).toBe(-1);

    g.toggleSwitch('b');
    g.evaluate(0.016);
    g.evaluate(0.016);

    expect(g.getOutput('and')).toBe(1);
    expect(g.getOutput('xor')).toBe(0);
  });

  it('oscila con timer y retarda señales con delay', () => {
    const g = new LogicGraph();
    g.addNode('clk', 'timer', { periodSec: 1.0, dutyCycle: 0.5 });
    g.addNode('del', 'delay', { delaySec: 0.3 });
    g.connect('clk', 'del');

    g.evaluate(0.1);
    expect(g.getOutput('clk')).toBe(1);
    expect(g.getOutput('del')).toBe(0);

    g.evaluate(0.1);
    expect(g.getOutput('del')).toBe(0);

    g.evaluate(0.35);
    expect(g.getOutput('del')).toBe(1);

    g.evaluate(0.1);
    expect(g.getOutput('clk')).toBe(0);
  });

  it('lee teclas bidireccionales en key_input y serializa el grafo completo', () => {
    const g = new LogicGraph();
    g.addNode('drive', 'key_input', { keyCode: 'KeyW', negativeKeyCode: 'KeyS' });
    g.addNode('thruster', 'thruster', { gain: 0.8 });
    g.connect('drive', 'thruster');

    g.evaluate(0.016, { keys: { KeyS: true } });
    g.evaluate(0.016, { keys: { KeyS: true } });
    expect(g.getOutput('thruster')).toBeCloseTo(-0.8, 5);

    const restored = LogicGraph.fromJSON(g.toJSON());
    restored.evaluate(0.016, { keys: { KeyW: true } });
    restored.evaluate(0.016, { keys: { KeyW: true } });
    expect(restored.getOutput('thruster')).toBeCloseTo(0.8, 5);
  });
});
