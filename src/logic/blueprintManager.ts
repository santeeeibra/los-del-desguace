import { WORKSHOP_SLOT_BY_ID } from '../invention/workshopAssembly';
import { CARRY_PROFILES, type GrabbableKind } from '../props/grabbableRegistry';
import { LOGIC_NODE_KINDS, type LogicGraphSnapshot } from './logicGraph';

export const BLUEPRINT_STORAGE_KEY = 'los-del-desguace.blueprints.v1';

export interface BlueprintPartEntry {
  partId: string;
  kind: GrabbableKind;
  slotId: string;
  parentId?: string;
  localPos: readonly [number, number, number];
  localRot: readonly [number, number, number, number];
  axle?: { x: number; y: number; z: number };
  /** Rueda de dirección (se soldó con unión de pivote vertical). */
  steer?: boolean;
}

export interface ContraptionBlueprint {
  version: 1;
  id: string;
  name: string;
  description?: string;
  guideSteps?: readonly string[];
  rootPartId?: string;
  category?: 'cart' | 'free';
  createdAt: number;
  parts: BlueprintPartEntry[];
  logic: LogicGraphSnapshot;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getSafeStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function presetPart(partId: string, kind: GrabbableKind, slotId: string): BlueprintPartEntry {
  const slot = WORKSHOP_SLOT_BY_ID.get(slotId)!;
  const rotation = slot.mountRotation;
  return {
    partId, kind, slotId, localPos: slot.position, axle: slot.axle,
    localRot: rotation ? [rotation.x, rotation.y, rotation.z, rotation.w] : [0, 0, 0, 1],
  };
}

function freePart(
  partId: string,
  kind: GrabbableKind,
  localPos: readonly [number, number, number],
  localRot: readonly [number, number, number, number] = [0, 0, 0, 1]
): BlueprintPartEntry {
  return { partId, kind, slotId: `free:cart:${partId}`, localPos, localRot };
}

function rootPart(
  partId: string,
  kind: GrabbableKind,
  localPos: readonly [number, number, number],
  localRot: readonly [number, number, number, number] = [0, 0, 0, 1]
): BlueprintPartEntry {
  return { partId, kind, slotId: `root:${partId}`, localPos, localRot };
}

function freeChildPart(
  partId: string,
  kind: GrabbableKind,
  parentId: string,
  localPos: readonly [number, number, number],
  localRot: readonly [number, number, number, number] = [0, 0, 0, 1]
): BlueprintPartEntry {
  return { partId, kind, slotId: `part:${parentId}:${partId}`, parentId, localPos, localRot };
}

export const PRESET_BLUEPRINTS: readonly ContraptionBlueprint[] = [
  {
    version: 1,
    id: 'preset-classic-cart',
    name: '1. Carrito Clásico',
    description: '4 ruedas, motor trasero y asiento listo para rodar.',
    guideSteps: ['4 ruedas en los ejes', 'Motor en capó trasero', 'Asiento al centro → Subir con E'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      presetPart('seat-1', 'seat', 'seat_center'),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'part-1', kind: 'motor', config: { gain: 1 }, bodyId: 'part-1' },
      ],
      wires: [{ id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'part-1', toPort: 'signal' }],
    },
  },
  {
    version: 1,
    id: 'preset-turbo-cart',
    name: '2. Carrito Turbo',
    description: 'Motor + batería + cohete trasero activable con Turbo.',
    guideSteps: ['4 ruedas + Motor trasero', 'Batería + Asiento al centro', 'Cohete atrás · Cable Batería → Cohete'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('battery-1', 'battery', [-0.36, 0.66, -0.42]),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'Space' }, bodyId: 'seat-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'power' },
        { id: 'wire_2', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-glider',
    name: '3. Planeador del Desguace',
    description: '2 alas aerodinámicas + cohete trasero para despegar.',
    guideSteps: ['4 ruedas + Asiento', '2 Alas laterales (wing_l / wing_r)', 'Cohete atrás + Turbo para volar'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('wing-1', 'wing', 'wing_l'),
      presetPart('wing-2', 'wing', 'wing_r'),
      presetPart('seat-1', 'seat', 'seat_center'),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
      ],
      wires: [{ id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' }],
    },
  },
  {
    version: 1,
    id: 'preset-night-buggy',
    name: '4. Buggy Explorador',
    description: 'Faro halógeno conectado a batería y tracción delantera.',
    guideSteps: ['4 ruedas + Motor delantero', 'Batería + Asiento', 'Faro adelante · Cable Batería → Faro'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_front'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('battery-1', 'battery', [-0.35, 0.66, -0.55]),
      freePart('headlight-1', 'headlight', [0, 0.58, 1.48]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'headlight-1', kind: 'light', config: { gain: 1 }, bodyId: 'headlight-1' },
      ],
      wires: [{ id: 'wire_1', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'headlight-1', toPort: 'power' }],
    },
  },
  {
    version: 1,
    id: 'preset-magnet-rover',
    name: '5. Recolector Magnético',
    description: 'Electroimán delantero activado por interruptor.',
    guideSteps: ['4 ruedas + Motor + Asiento', 'Electroimán adelante', 'Interruptor → Imán (Encender)'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('switch-1', 'switchBox', [-0.46, 0.58, 0.55]),
      freePart('magnet-1', 'magnet', [0, 0.58, 1.34]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'switch-1', kind: 'switch', config: { active: true }, bodyId: 'switch-1' },
        { id: 'magnet-1', kind: 'magnet', config: { gain: 1 }, bodyId: 'magnet-1' },
      ],
      wires: [{ id: 'wire_1', fromNodeId: 'switch-1', fromPort: 'out', toNodeId: 'magnet-1', toPort: 'signal' }],
    },
  },
  {
    version: 1,
    id: 'preset-pulse-jumper',
    name: '6. Saltador de Pulsos',
    description: 'Temporizador disparando el cohete cada 1.4s.',
    guideSteps: ['4 ruedas + Motor + Asiento', 'Timer (1.4s) en el chasis', 'Cable Timer → Cohete trasero'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('timer-1', 'timerBox', [-0.36, 0.56, -0.35]),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'timer-1', kind: 'timer', config: { periodSec: 1.4, dutyCycle: 0.45 }, bodyId: 'timer-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
      ],
      wires: [{ id: 'wire_1', fromNodeId: 'timer-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' }],
    },
  },
  {
    version: 1,
    id: 'preset-double-dragster',
    name: '7. Dragster Doble Propulsión',
    description: 'Cohete + bidón propulsor alimentados por batería.',
    guideSteps: ['4 ruedas + Motor + Batería', 'Cohete + Bidón atrás', 'Cable Batería → Cohete y Bidón'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('battery-1', 'battery', [-0.36, 0.66, -0.42]),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
      freePart('canister-1', 'canister', [0.42, 0.66, -1.52], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
        { id: 'canister-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'canister-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'power' },
        { id: 'wire_2', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'canister-1', toPort: 'power' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-wood-hauler',
    name: '8. Carguero de Madera',
    description: 'Canasta trasera con barril de madera para entregas.',
    guideSteps: ['4 ruedas + Motor delantero + Asiento', 'Canasta trasera (rack_rear)', 'Barril de madera encima'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_front'),
      presetPart('seat-1', 'seat', 'seat_center'),
      presetPart('rack-1', 'cargoRack', 'rack_rear'),
      freePart('wood-barrel-1', 'woodBarrel', [0, 1.15, -0.78]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'part-1', kind: 'motor', config: { gain: 1 }, bodyId: 'part-1' },
      ],
      wires: [{ id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'part-1', toPort: 'signal' }],
    },
  },
  {
    version: 1,
    id: 'preset-sky-cargo',
    name: '9. Avión de Carga',
    description: '2 alas + faro delantero + cohete propulsor.',
    guideSteps: ['4 ruedas + 2 Alas + Asiento', 'Faro adelante + Batería', 'Cohete atrás · Turbo para despegar'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('wing-1', 'wing', 'wing_l'),
      presetPart('wing-2', 'wing', 'wing_r'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('headlight-1', 'headlight', [0, 0.58, 1.32]),
      freePart('battery-1', 'battery', [-0.36, 0.66, -0.58]),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'headlight-1', kind: 'light', config: { gain: 1 }, bodyId: 'headlight-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'headlight-1', toPort: 'power' },
        { id: 'wire_2', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'power' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-logic-and',
    name: '10. Máquina Lógica AND',
    description: 'Interruptor + Timer pasan por puerta AND para disparar el cohete.',
    guideSteps: ['Interruptor + Timer → Puerta AND', 'Puerta AND → Cohete trasero', 'Apagá Interruptor para cortar el cohete'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('switch-1', 'switchBox', [-0.46, 0.58, 0.62]),
      freePart('timer-1', 'timerBox', [-0.46, 0.58, 0.12]),
      freePart('and-1', 'logicAnd', [-0.46, 0.58, -0.42]),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'switch-1', kind: 'switch', config: { active: true }, bodyId: 'switch-1' },
        { id: 'timer-1', kind: 'timer', config: { periodSec: 1.2, dutyCycle: 0.5 }, bodyId: 'timer-1' },
        { id: 'and-1', kind: 'and', config: {}, bodyId: 'and-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'switch-1', fromPort: 'out', toNodeId: 'and-1', toPort: 'a' },
        { id: 'wire_2', fromNodeId: 'timer-1', fromPort: 'out', toNodeId: 'and-1', toPort: 'b' },
        { id: 'wire_3', fromNodeId: 'and-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-blimp',
    name: '11. Dirigible Chatarrero',
    description: '2 globos de helio + turbina hélice trasera para flotar por el patio.',
    guideSteps: ['4 ruedas + Asiento + Batería', '2 Globos de helio arriba', 'Turbina atrás · Asiento + Batería → Turbina'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('battery-1', 'battery', [-0.36, 0.66, -0.42]),
      freePart('balloon-1', 'balloon', [-0.6, 1.42, 0.2]),
      freePart('balloon-2', 'balloon', [0.6, 1.42, 0.2]),
      freePart('fan-1', 'fan', [0, 0.72, -1.34], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'fan-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'fan-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'fan-1', toPort: 'signal' },
        { id: 'wire_2', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'fan-1', toPort: 'power' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-kangaroo',
    name: '12. Saltador Canguro',
    description: '2 resortes delanteros + bocina loca para saltar rampas y tirar barriles.',
    guideSteps: ['4 ruedas + Motor trasero + Asiento', '2 Resortes adelante + Bocina en la trompa', 'Usá Espacio / Turbo para saltar y tocar bocina'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      presetPart('seat-1', 'seat', 'seat_center'),
      freePart('spring-1', 'spring', [-0.45, 0.68, 0.82]),
      freePart('spring-2', 'spring', [0.45, 0.68, 0.82]),
      freePart('horn-1', 'horn', [0, 0.68, 1.2]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'part-1', kind: 'motor', config: { gain: 1 }, bodyId: 'part-1' },
      ],
      wires: [{ id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'part-1', toPort: 'signal' }],
    },
  },
  {
    version: 1,
    id: 'preset-ram-bot',
    name: '13. Robot Ariete',
    description: 'Chasis de combate con parachoques, propulsor trasero y bocina expansiva para la Arena.',
    guideSteps: ['4 ruedas + Motor + Batería + Asiento', 'Parachoques adelante + Cohete atrás', 'Bocina al frente para empujar rivales'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      presetPart('part-1', 'part', 'engine_rear'),
      freePart('battery-1', 'battery', [-0.36, 0.66, -0.42]),
      presetPart('seat-1', 'seat', 'seat_center'),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
      freePart('horn-1', 'horn', [0, 0.7, 1.18]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'part-1', kind: 'motor', config: { gain: 1 }, bodyId: 'part-1' },
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'part-1', toPort: 'signal' },
        { id: 'wire_2', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-sky-fighter',
    name: '14. Avión Cazador',
    description: 'Biplano liviano con 2 alas, cohete y turbina superior para derribar drones en el cielo.',
    guideSteps: ['4 ruedas + Motor + Batería + Asiento', '2 Alas laterales + Cohete atrás', 'Turbina hélice en el techo · Turbo (Espacio)'],
    createdAt: 0,
    parts: [
      presetPart('wheel-1', 'wheel', 'wheel_fl'),
      presetPart('wheel-2', 'wheel', 'wheel_fr'),
      presetPart('wheel-3', 'wheel', 'wheel_rl'),
      presetPart('wheel-4', 'wheel', 'wheel_rr'),
      freePart('battery-1', 'battery', [-0.36, 0.66, -0.58]),
      presetPart('seat-1', 'seat', 'seat_center'),
      presetPart('wing-1', 'wing', 'wing_l'),
      presetPart('wing-2', 'wing', 'wing_r'),
      presetPart('thruster-1', 'thruster', 'thruster_rear'),
      freePart('fan-1', 'fan', [0, 0.68, 1.38], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
        { id: 'fan-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'fan-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'fan-1', toPort: 'power' },
        { id: 'wire_2', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-flying-barrel',
    name: '15. Barril Cohete Volador',
    description: 'Barril de madera sin ruedas, estabilizado con giroscopio, 2 alas y 2 cohetes.',
    guideSteps: ['Barril base + Giroscopio + Batería', '2 Cohetes laterales + 2 Alas', 'Subite al barril (E) · Espacio para despegar'],
    rootPartId: 'wood-barrel-1',
    category: 'free',
    createdAt: 0,
    parts: [
      rootPart('wood-barrel-1', 'woodBarrel', [0, 0.56, 0]),
      freeChildPart('gyro-1', 'gyro', 'wood-barrel-1', [0, -0.05, -0.60]),
      freeChildPart('battery-1', 'battery', 'wood-barrel-1', [0, 0.0, 0.64]),
      freeChildPart('thruster-1', 'thruster', 'wood-barrel-1', [-0.58, -0.04, 0]),
      freeChildPart('thruster-2', 'thruster', 'wood-barrel-1', [0.58, -0.04, 0]),
      freeChildPart('wing-1', 'wing', 'wood-barrel-1', [-1.34, 0.04, 0]),
      freeChildPart('wing-2', 'wing', 'wood-barrel-1', [1.34, 0.04, 0]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'wood-barrel-1', kind: 'key_input', config: { keyCode: 'Space' }, bodyId: 'wood-barrel-1' },
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
        { id: 'thruster-2', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-2' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'wood-barrel-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' },
        { id: 'wire_2', fromNodeId: 'wood-barrel-1', fromPort: 'out', toNodeId: 'thruster-2', toPort: 'signal' },
        { id: 'wire_3', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'power' },
        { id: 'wire_4', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'thruster-2', toPort: 'power' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-jetpack-robot',
    name: '16. Robot con Propulsores',
    description: 'Robot bípedo sin ruedas con patas de resorte, giroscopio, faro ojo, imán, bocina y jetpack doble.',
    guideSteps: ['Torso caja + 2 Resortes patas + Asiento', 'Giroscopio + Faro + Batería + Jetpack', 'Subite y usá Espacio para volar con jetpack'],
    rootPartId: 'crate-1',
    category: 'free',
    createdAt: 0,
    parts: [
      rootPart('crate-1', 'crate', [0, 0.88, 0]),
      freeChildPart('spring-1', 'spring', 'crate-1', [-0.22, -0.56, 0]),
      freeChildPart('spring-2', 'spring', 'crate-1', [0.22, -0.56, 0]),
      freeChildPart('seat-1', 'seat', 'crate-1', [0, 0.65, 0]),
      freeChildPart('gyro-1', 'gyro', 'crate-1', [0, 0.0, 0.56]),
      freeChildPart('headlight-1', 'headlight', 'crate-1', [0, 0.42, 0.54]),
      freeChildPart('thruster-1', 'thruster', 'crate-1', [-0.24, 0.12, -0.54]),
      freeChildPart('thruster-2', 'thruster', 'crate-1', [0.24, 0.12, -0.54]),
      freeChildPart('battery-1', 'battery', 'crate-1', [0, 0.72, -0.56]),
      freeChildPart('magnet-1', 'magnet', 'crate-1', [0.58, 0.06, 0.06]),
      freeChildPart('horn-1', 'horn', 'crate-1', [-0.56, 0.06, 0.06]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'Space' }, bodyId: 'seat-1' },
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'thruster-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-1' },
        { id: 'thruster-2', kind: 'thruster', config: { gain: 1 }, bodyId: 'thruster-2' },
        { id: 'headlight-1', kind: 'light', config: { gain: 1 }, bodyId: 'headlight-1' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'signal' },
        { id: 'wire_2', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'thruster-2', toPort: 'signal' },
        { id: 'wire_3', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'thruster-1', toPort: 'power' },
        { id: 'wire_4', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'thruster-2', toPort: 'power' },
        { id: 'wire_5', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'headlight-1', toPort: 'power' },
      ],
    },
  },
  {
    version: 1,
    id: 'preset-balloon-chair',
    name: '17. Silla Voladora de Globos',
    description: 'Asiento libre flotando con 2 globos de helio, giroscopio y 2 turbinas de dirección.',
    guideSteps: ['Asiento + Giroscopio abajo + Batería', '2 Globos arriba + 2 Turbinas atrás', 'Subite (E) · W/S/Espacio/Shift para navegar el cielo'],
    rootPartId: 'seat-1',
    category: 'free',
    createdAt: 0,
    parts: [
      rootPart('seat-1', 'seat', [0, 0.82, 0]),
      freeChildPart('gyro-1', 'gyro', 'seat-1', [0, -0.54, 0]),
      freeChildPart('battery-1', 'battery', 'seat-1', [0, 0.05, -0.56]),
      freeChildPart('balloon-1', 'balloon', 'seat-1', [-0.62, 0.68, 0]),
      freeChildPart('balloon-2', 'balloon', 'seat-1', [0.62, 0.68, 0]),
      freeChildPart('fan-1', 'fan', 'seat-1', [-0.58, -0.05, -0.48], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]),
      freeChildPart('fan-2', 'fan', 'seat-1', [0.58, -0.05, -0.48], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]),
    ],
    logic: {
      version: 1,
      nodes: [
        { id: 'seat-1', kind: 'key_input', config: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' }, bodyId: 'seat-1' },
        { id: 'battery-1', kind: 'battery', config: { charge: 1 }, bodyId: 'battery-1' },
        { id: 'fan-1', kind: 'thruster', config: { gain: 1 }, bodyId: 'fan-1' },
        { id: 'fan-2', kind: 'thruster', config: { gain: 1 }, bodyId: 'fan-2' },
      ],
      wires: [
        { id: 'wire_1', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'fan-1', toPort: 'signal' },
        { id: 'wire_2', fromNodeId: 'seat-1', fromPort: 'out', toNodeId: 'fan-2', toPort: 'signal' },
        { id: 'wire_3', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'fan-1', toPort: 'power' },
        { id: 'wire_4', fromNodeId: 'battery-1', fromPort: 'out', toNodeId: 'fan-2', toPort: 'power' },
      ],
    },
  },
];

export const VALID_BLUEPRINT_KINDS: ReadonlySet<GrabbableKind> = new Set<GrabbableKind>([
  'crate',
  'wheel',
  'canister',
  'part',
  'battery',
  'woodBarrel',
  'wing',
  'headlight',
  'seat',
  'thruster',
  'timerBox',
  'switchBox',
  'logicAnd',
  'magnet',
  'chassis',
  'cargoRack',
  'spring',
  'balloon',
  'fan',
  'horn',
  'gyro',
  'boxingGlove',
  'droneRotor',
  'flag',
]);

export function createBlueprint(
  name: string,
  parts: BlueprintPartEntry[],
  graph: { toJSON: () => LogicGraphSnapshot },
  options?: { rootPartId?: string; category?: 'cart' | 'free' }
): ContraptionBlueprint {
  const cleanName = name.trim() || 'Invento sin nombre';
  return {
    version: 1,
    id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    ...(options?.rootPartId ? { rootPartId: options.rootPartId } : {}),
    ...(options?.category ? { category: options.category } : {}),
    createdAt: Date.now(),
    parts: parts.map((p) => ({
      ...p, localPos: [...p.localPos], localRot: [...p.localRot],
      axle: p.axle ? { ...p.axle } : undefined,
      ...(p.steer ? { steer: true } : {}),
    })),
    logic: graph.toJSON(),
  };
}

export function listBlueprints(storage?: StorageLike): ContraptionBlueprint[] {
  const store = getSafeStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(BLUEPRINT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((plan) => plan?.version === 1 && typeof plan.name === 'string' && typeof plan.id === 'string' &&
      (plan.rootPartId === undefined || typeof plan.rootPartId === 'string') &&
      plan.parts?.length > 0 && Array.isArray(plan.parts) &&
      plan.parts.every((part: BlueprintPartEntry) => part && typeof part.partId === 'string' && typeof part.slotId === 'string' &&
        part.localPos?.length === 3 && Array.isArray(part.localPos) && part.localPos.every(Number.isFinite) &&
        part.localRot?.length === 4 && Array.isArray(part.localRot) && part.localRot.every(Number.isFinite)) &&
      plan.logic?.version === 1 && Array.isArray(plan.logic.nodes) && Array.isArray(plan.logic.wires) &&
      plan.logic.nodes.every((node: { id?: string }) => typeof node?.id === 'string') &&
      plan.logic.wires.every((wire: { fromNodeId?: string; toNodeId?: string }) =>
        typeof wire?.fromNodeId === 'string' && typeof wire.toNodeId === 'string'));
  } catch {
    return [];
  }
}

export function saveBlueprint(blueprint: ContraptionBlueprint, storage?: StorageLike): ContraptionBlueprint[] {
  const current = listBlueprints(storage).filter((b) => b.id !== blueprint.id);
  const next = [blueprint, ...current].slice(0, 20);
  const store = getSafeStorage(storage);
  if (store) {
    try {
      store.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}

export function deleteBlueprint(id: string, storage?: StorageLike): ContraptionBlueprint[] {
  const next = listBlueprints(storage).filter((b) => b.id !== id);
  const store = getSafeStorage(storage);
  if (store) {
    try {
      store.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}

const SHARE_PREFIX = 'YUNKE1:';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeBlueprintCode(blueprint: ContraptionBlueprint): string {
  const compact = {
    v: 1,
    n: blueprint.name,
    ...(blueprint.rootPartId ? { r: blueprint.rootPartId } : {}),
    p: blueprint.parts,
    l: blueprint.logic,
  };
  return SHARE_PREFIX + toBase64Url(JSON.stringify(compact));
}

export function decodeBlueprintCode(raw: string): ContraptionBlueprint | null {
  let code = raw.trim();
  if (!code || code.length > 200_000) return null;
  try {
    if (/^https?:\/\//i.test(code)) code = new URL(code).searchParams.get('bp') ?? '';
    const payload = code.startsWith(SHARE_PREFIX) ? code.slice(SHARE_PREFIX.length) : code;
    const parsed = JSON.parse(fromBase64Url(payload)) as {
      v?: number;
      n?: string;
      r?: string;
      p?: BlueprintPartEntry[];
      l?: LogicGraphSnapshot;
    };
    if (
      parsed?.v !== 1 ||
      typeof parsed.n !== 'string' ||
      (parsed.r !== undefined && typeof parsed.r !== 'string') ||
      !Array.isArray(parsed.p) ||
      parsed.p.length === 0 ||
      parsed.p.length > 40 ||
      !parsed.l ||
      parsed.l.version !== 1 ||
      !Array.isArray(parsed.l.nodes) ||
      parsed.l.nodes.length > 60 ||
      !Array.isArray(parsed.l.wires) ||
      parsed.l.wires.length > 100
    ) {
      return null;
    }
    if (parsed.r !== undefined && !parsed.p.some((part) => part?.partId === parsed.r)) return null;
    const validParts = parsed.p.every(
      (part) =>
        part &&
        typeof part.partId === 'string' &&
        typeof part.kind === 'string' &&
        VALID_BLUEPRINT_KINDS.has(part.kind as GrabbableKind) &&
        Object.hasOwn(CARRY_PROFILES, part.kind) &&
        typeof part.slotId === 'string' &&
        (part.parentId === undefined || typeof part.parentId === 'string') &&
        Array.isArray(part.localPos) &&
        part.localPos.length === 3 &&
        part.localPos.every((value) => Number.isFinite(value) && Math.abs(value) <= 1000) &&
        Array.isArray(part.localRot) &&
        part.localRot.length === 4 &&
        part.localRot.every(Number.isFinite) &&
        Math.abs(Math.hypot(...part.localRot) - 1) < 0.03 &&
        (part.axle === undefined || (part.axle &&
          [part.axle.x, part.axle.y, part.axle.z].every(Number.isFinite) &&
          Math.abs(Math.hypot(part.axle.x, part.axle.y, part.axle.z) - 1) < 0.03)) &&
        (part.steer === undefined || typeof part.steer === 'boolean')
    );
    if (!validParts || new Set(parsed.p.map(({ partId }) => partId)).size !== parsed.p.length) return null;
    const nodeIds = new Set<string>();
    for (const node of parsed.l.nodes) {
      if (!node || typeof node.id !== 'string' || typeof node.kind !== 'string' ||
          nodeIds.has(node.id) || !LOGIC_NODE_KINDS.includes(node.kind) ||
          (node.bodyId !== undefined && typeof node.bodyId !== 'string') ||
          !node.config || typeof node.config !== 'object' || Array.isArray(node.config) ||
          !Object.values(node.config).every((value) => typeof value === 'boolean' || typeof value === 'string' ||
            (Number.isFinite(value) && Math.abs(value as number) <= 1000))) return null;
      nodeIds.add(node.id);
    }
    if (!parsed.l.wires.every((wire) => wire && typeof wire.id === 'string' &&
      typeof wire.fromNodeId === 'string' && typeof wire.toNodeId === 'string' &&
      nodeIds.has(wire.fromNodeId) && nodeIds.has(wire.toNodeId) &&
      typeof wire.fromPort === 'string' && typeof wire.toPort === 'string')) return null;
    return {
      version: 1,
      id: `shared_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: parsed.n.trim().slice(0, 40) || 'Invento compartido',
      ...(parsed.r ? { rootPartId: parsed.r, category: 'free' as const } : {}),
      createdAt: Date.now(),
      parts: parsed.p,
      logic: parsed.l,
    };
  } catch {
    return null;
  }
}

export function buildBlueprintShareUrl(blueprint: ContraptionBlueprint): string {
  const code = encodeBlueprintCode(blueprint);
  if (typeof window === 'undefined') return `?bp=${encodeURIComponent(code)}`;
  const url = new URL(window.location.href);
  url.searchParams.set('bp', code);
  return url.toString();
}

export function readBlueprintFromUrl(): ContraptionBlueprint | null {
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('bp');
    return param ? decodeBlueprintCode(param) : null;
  } catch {
    return null;
  }
}
