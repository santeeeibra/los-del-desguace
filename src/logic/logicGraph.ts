export const LOGIC_NODE_KINDS = [
  'battery', 'switch', 'key_input', 'timer', 'sensor', 'and', 'or', 'not',
  'xor', 'invert', 'delay', 'latch', 'mul', 'motor', 'servo', 'piston', 'thruster', 'light', 'magnet',
] as const;
export type LogicNodeKind = (typeof LOGIC_NODE_KINDS)[number];

export interface LogicNodeConfig {
  /** Para `switch` y `sensor`. */
  active?: boolean;
  /** Para `battery`: 0..1, default 1. */
  charge?: number;
  /** Para `key_input`: código de tecla positivo (ej. 'KeyW', 'Digit1'). */
  keyCode?: string;
  /** Para `key_input`: tecla opcional negativa (ej. 'KeyS') para señal -1..+1. */
  negativeKeyCode?: string;
  /** Para `timer`: periodo en segundos (default 1.0) y dutyCycle 0..1 (default 0.5). */
  periodSec?: number;
  dutyCycle?: number;
  /** Para `timer`: 'square' (0/1) o 'sine' (-1..+1). */
  waveform?: 'square' | 'sine';
  /** Para `delay`: retardo en segundos (default 0.5). */
  delaySec?: number;
  /** Para actuadores (`motor`, `servo`, `piston`, `thruster`): escala física opcional. */
  gain?: number;
}

export interface LogicNode {
  id: string;
  kind: LogicNodeKind;
  label?: string;
  /** Referencia opcional a un objeto físico/grabbable en la escena. */
  bodyId?: string;
  config: LogicNodeConfig;
  /** Valor de salida actual (-1..+1). */
  output: number;
}

export interface LogicWire {
  id: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
  /** Última señal transportada (-1..+1), útil para iluminar cables 3D. */
  signal: number;
}

export interface LogicEvalInputs {
  /** Teclas presionadas actualmente (ej. { KeyW: true, Digit1: true }). */
  keys?: Record<string, boolean>;
  /** Lecturas externas de sensores por nodeId (0..1 o booleano). */
  sensors?: Record<string, number | boolean>;
}

export interface LogicGraphSnapshot {
  version: 1;
  nodes: Array<Omit<LogicNode, 'output'>>;
  wires: Array<Omit<LogicWire, 'signal'>>;
}

interface InternalNodeState {
  elapsed: number;
  prevInputA: number;
  prevInputB: number;
  latched: boolean;
  delayQueue: Array<{ at: number; value: number }>;
}

const ACTIVE_THRESHOLD = 0.5;

function clampSignal(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

function isHigh(v: number): boolean {
  return Math.abs(v) > ACTIVE_THRESHOLD;
}

/**
 * Grafo de señales lógicas (-1..+1) para conectar fuentes, puertas lógicas y actuadores físicos.
 * Evaluado de forma determinista por tick; soporta ciclos con retardo de 1 tick sin bucles infinitos.
 */
export class LogicGraph {
  private nodes = new Map<string, LogicNode>();
  private wires = new Map<string, LogicWire>();
  private state = new Map<string, InternalNodeState>();
  private clock = 0;
  private wireSeq = 1;

  addNode(
    id: string,
    kind: LogicNodeKind,
    config: LogicNodeConfig = {},
    extra: { label?: string; bodyId?: string } = {}
  ): LogicNode {
    const node: LogicNode = {
      id,
      kind,
      label: extra.label,
      bodyId: extra.bodyId,
      config: { ...config },
      output: 0,
    };
    this.nodes.set(id, node);
    this.state.set(id, {
      elapsed: 0,
      prevInputA: 0,
      prevInputB: 0,
      latched: Boolean(config.active),
      delayQueue: [],
    });
    return node;
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    this.state.delete(id);
    for (const [wireId, wire] of this.wires) {
      if (wire.fromNodeId === id || wire.toNodeId === id) {
        this.wires.delete(wireId);
      }
    }
  }

  getNode(id: string): LogicNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): LogicNode[] {
    return Array.from(this.nodes.values());
  }

  getWires(): LogicWire[] {
    return Array.from(this.wires.values());
  }

  hasWires(): boolean {
    return this.wires.size > 0;
  }

  hasIncoming(nodeId: string): boolean {
    for (const wire of this.wires.values()) if (wire.toNodeId === nodeId) return true;
    return false;
  }

  hasConnection(nodeId: string): boolean {
    for (const wire of this.wires.values()) if (wire.fromNodeId === nodeId || wire.toNodeId === nodeId) return true;
    return false;
  }

  connect(
    fromNodeId: string,
    toNodeId: string,
    options: { fromPort?: string; toPort?: string; id?: string } = {}
  ): LogicWire | null {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) return null;
    const fromPort = options.fromPort ?? 'out';
    const toPort = options.toPort ?? 'in';
    if (fromNodeId === toNodeId && fromPort === toPort) return null;

    for (const existing of this.wires.values()) {
      if (
        existing.fromNodeId === fromNodeId &&
        existing.fromPort === fromPort &&
        existing.toNodeId === toNodeId &&
        existing.toPort === toPort
      ) {
        return existing;
      }
    }

    const id = options.id ?? `wire_${this.wireSeq++}`;
    const wire: LogicWire = {
      id,
      fromNodeId,
      fromPort,
      toNodeId,
      toPort,
      signal: 0,
    };
    this.wires.set(id, wire);
    return wire;
  }

  disconnect(wireId: string): boolean {
    return this.wires.delete(wireId);
  }

  toggleSwitch(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || node.kind !== 'switch') return false;
    node.config.active = !node.config.active;
    return Boolean(node.config.active);
  }

  setNodeConfig(nodeId: string, patch: Partial<LogicNodeConfig>): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    Object.assign(node.config, patch);
  }

  /** Evalúa un paso lógico de duración `dt` segundos. */
  evaluate(dt: number, inputs: LogicEvalInputs = {}): void {
    const safeDt = Math.max(0, dt);
    this.clock += safeDt;

    // 1. Capturar salidas previas para evaluación consistente (evita depender del orden de inserción en ciclos)
    const prevOutputs = new Map<string, number>();
    for (const node of this.nodes.values()) {
      prevOutputs.set(node.id, node.output);
    }

    // 2. Agrupar señales entrantes por nodo y puerto
    const incomingByNode = new Map<string, Map<string, number[]>>();
    for (const wire of this.wires.values()) {
      const sig = prevOutputs.get(wire.fromNodeId) ?? 0;
      wire.signal = sig;
      let portMap = incomingByNode.get(wire.toNodeId);
      if (!portMap) {
        portMap = new Map();
        incomingByNode.set(wire.toNodeId, portMap);
      }
      const list = portMap.get(wire.toPort);
      if (list) list.push(sig);
      else portMap.set(wire.toPort, [sig]);
    }

    // 3. Evaluar cada nodo
    for (const node of this.nodes.values()) {
      const st = this.state.get(node.id)!;
      st.elapsed += safeDt;
      const ports = incomingByNode.get(node.id);
      const allInputs: number[] = [];
      if (ports) {
        for (const list of ports.values()) allInputs.push(...list);
      }
      const primary = ports?.get('in')?.[0] ?? ports?.get('a')?.[0] ?? allInputs[0] ?? 0;
      const secondary = ports?.get('b')?.[0] ?? allInputs[1] ?? 0;
      const powerPort = ports?.get('power')?.[0];

      let nextOut = 0;

      switch (node.kind) {
        case 'battery': {
          const charge = node.config.charge ?? 1;
          nextOut = charge > 0 ? 1 : 0;
          break;
        }
        case 'switch': {
          nextOut = node.config.active ? 1 : 0;
          break;
        }
        case 'key_input': {
          const keys = inputs.keys ?? {};
          const pos = node.config.keyCode ? (keys[node.config.keyCode] ? 1 : 0) : 0;
          const neg = node.config.negativeKeyCode ? (keys[node.config.negativeKeyCode] ? 1 : 0) : 0;
          nextOut = pos - neg;
          break;
        }
        case 'timer': {
          const period = Math.max(0.05, node.config.periodSec ?? 1.0);
          const phase = (st.elapsed % period) / period;
          if (node.config.waveform === 'sine') {
            nextOut = Math.sin(phase * Math.PI * 2);
          } else {
            const duty = Math.max(0.05, Math.min(0.95, node.config.dutyCycle ?? 0.5));
            nextOut = phase < duty ? 1 : 0;
          }
          break;
        }
        case 'sensor': {
          const ext = inputs.sensors?.[node.id];
          if (typeof ext === 'boolean') nextOut = ext ? 1 : 0;
          else if (typeof ext === 'number') nextOut = clampSignal(ext);
          else nextOut = node.config.active ? 1 : 0;
          break;
        }
        case 'and': {
          nextOut = allInputs.length >= 2 && allInputs.every(isHigh) ? 1 : 0;
          break;
        }
        case 'or': {
          if (allInputs.length === 0) nextOut = 0;
          else nextOut = allInputs.some(isHigh) ? 1 : 0;
          break;
        }
        case 'not': {
          nextOut = isHigh(primary) ? 0 : 1;
          break;
        }
        case 'xor': {
          const activeCount = allInputs.filter(isHigh).length;
          nextOut = activeCount % 2 === 1 ? 1 : 0;
          break;
        }
        case 'invert': {
          nextOut = clampSignal(-primary);
          break;
        }
        case 'mul': {
          if (allInputs.length < 2) nextOut = 0;
          else nextOut = clampSignal(allInputs.reduce((acc, v) => acc * v, 1));
          break;
        }
        case 'delay': {
          const delaySec = Math.max(0, node.config.delaySec ?? 0.5);
          st.delayQueue.push({ at: this.clock + delaySec, value: primary });
          let ready = node.output;
          while (st.delayQueue.length > 0 && st.delayQueue[0].at <= this.clock + 1e-6) {
            ready = st.delayQueue.shift()!.value;
          }
          nextOut = clampSignal(ready);
          break;
        }
        case 'latch': {
          const risingA = isHigh(primary) && !isHigh(st.prevInputA);
          const risingB = isHigh(secondary) && !isHigh(st.prevInputB);
          if (risingB) st.latched = false;
          else if (risingA) st.latched = !st.latched;
          nextOut = st.latched ? 1 : 0;
          break;
        }
        case 'motor':
        case 'servo':
        case 'piston':
        case 'thruster':
        case 'light':
        case 'magnet': {
          // Si el puerto `power` está cableado, exige energía (> 0.5) para operar el actuador.
          const hasPower = powerPort === undefined ? true : isHigh(powerPort);
          const signalPort = ports?.get('in')?.[0] ?? ports?.get('signal')?.[0] ?? primary;
          const gain = node.config.gain ?? 1;
          nextOut = hasPower ? clampSignal(signalPort * gain) : 0;
          break;
        }
      }

      st.prevInputA = primary;
      st.prevInputB = secondary;
      node.output = clampSignal(nextOut);
    }

    // 4. Actualizar señal visible de cada cable con la salida recién calculada
    for (const wire of this.wires.values()) {
      wire.signal = this.nodes.get(wire.fromNodeId)?.output ?? 0;
    }
  }

  getOutput(nodeId: string): number {
    return this.nodes.get(nodeId)?.output ?? 0;
  }

  toJSON(): LogicGraphSnapshot {
    return {
      version: 1,
      nodes: Array.from(this.nodes.values()).map(({ output: _o, ...rest }) => ({
        ...rest,
        config: { ...rest.config },
      })),
      wires: Array.from(this.wires.values()).map(({ signal: _s, ...rest }) => ({ ...rest })),
    };
  }

  static fromJSON(snapshot: LogicGraphSnapshot): LogicGraph {
    const graph = new LogicGraph();
    for (const n of snapshot.nodes) {
      graph.addNode(n.id, n.kind, n.config, { label: n.label, bodyId: n.bodyId });
    }
    for (const w of snapshot.wires) {
      graph.connect(w.fromNodeId, w.toNodeId, {
        fromPort: w.fromPort,
        toPort: w.toPort,
        id: w.id,
      });
    }
    return graph;
  }
}
