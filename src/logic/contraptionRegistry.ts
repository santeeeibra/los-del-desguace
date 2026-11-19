import { Quaternion, Vector3 } from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import { playHornSfx, playSpringBoing } from '../audio/sfxEngine';
import { grabbableRegistry, type GrabbableKind } from '../props/grabbableRegistry';
import { gameStore } from '../state/gameStore';
import { LogicGraph, type LogicNodeConfig, type LogicNodeKind } from './logicGraph';

export type CrazyPartKind =
  | GrabbableKind
  | 'piston'
  | 'switch_box'
  | 'timer_box';

export interface PartLogicSpec {
  nodeKind: LogicNodeKind;
  defaultConfig?: LogicNodeConfig;
  /** Fuerza direccional local (eje +Y o +Z) cuando actúa como propulsor/ala. */
  thrustForce?: number;
  /** Torque rotatorio local cuando actúa como motor suelto. */
  spinTorque?: number;
  label: string;
}

/**
 * Catálogo extensible de comportamientos lógicos y físicos por tipo de pieza.
 * Agregar piezas locas (alas, faros, asientos, propulsores, etc.) solo requiere sumar una entrada aquí.
 */
export const PART_LOGIC_SPECS: Partial<Record<CrazyPartKind, PartLogicSpec>> = {
  battery: {
    nodeKind: 'battery',
    defaultConfig: { charge: 1 },
    label: 'Batería (Fuente 12V)',
  },
  part: { nodeKind: 'motor', defaultConfig: { gain: 1 }, label: 'Motor' },
  wheel: {
    nodeKind: 'motor',
    defaultConfig: { gain: 1 },
    spinTorque: 2.8,
    label: 'Rueda Motorizada',
  },
  canister: {
    nodeKind: 'thruster',
    defaultConfig: { gain: 1 },
    thrustForce: 28,
    label: 'Bidón Propulsor',
  },
  crate: {
    nodeKind: 'switch',
    defaultConfig: { active: true },
    label: 'Caja Interruptor',
  },
  // Piezas opcionales futuras listas para conectar al mismo grafo:
  wing: {
    nodeKind: 'sensor',
    defaultConfig: { active: true },
    thrustForce: 18,
    label: 'Ala Aerodinámica',
  },
  headlight: {
    nodeKind: 'light',
    defaultConfig: { gain: 1 },
    label: 'Faro Halógeno',
  },
  seat: {
    nodeKind: 'key_input',
    defaultConfig: { keyCode: 'KeyW', negativeKeyCode: 'KeyS' },
    label: 'Asiento de Piloto',
  },
  thruster: {
    nodeKind: 'thruster',
    defaultConfig: { gain: 1 },
    thrustForce: 420,
    label: 'Cohete Propulsor',
  },
  piston: {
    nodeKind: 'piston',
    defaultConfig: { gain: 1 },
    label: 'Pistón Neumático',
  },
  switch_box: {
    nodeKind: 'switch',
    defaultConfig: { active: false },
    label: 'Interruptor Palanca',
  },
  timer_box: {
    nodeKind: 'timer',
    defaultConfig: { periodSec: 1.5, dutyCycle: 0.5 },
    label: 'Temporizador',
  },
  timerBox: {
    nodeKind: 'timer',
    defaultConfig: { periodSec: 1.4, dutyCycle: 0.5 },
    label: 'Temporizador',
  },
  switchBox: {
    nodeKind: 'switch',
    defaultConfig: { active: false },
    label: 'Interruptor',
  },
  logicAnd: {
    nodeKind: 'and',
    label: 'Puerta AND',
  },
  magnet: {
    nodeKind: 'magnet',
    defaultConfig: { gain: 1 },
    label: 'Electroimán',
  },
  spring: {
    nodeKind: 'piston',
    defaultConfig: { gain: 1 },
    label: 'Resorte Saltarín',
  },
  balloon: {
    nodeKind: 'sensor',
    defaultConfig: { active: true },
    label: 'Globo de Helio',
  },
  fan: {
    nodeKind: 'thruster',
    defaultConfig: { gain: 1 },
    thrustForce: 175,
    label: 'Turbina Hélice',
  },
  horn: {
    nodeKind: 'light',
    defaultConfig: { gain: 1 },
    label: 'Bocina Loca',
  },
  gyro: {
    nodeKind: 'sensor',
    defaultConfig: { active: true },
    label: 'Giroscopio Estabilizador',
  },
};

export const contraptionGraph = new LogicGraph();
const activeTurbo = new Set<string>();
const springCooldowns = new Map<string, number>();
const hornCooldowns = new Map<string, number>();

let pendingWireFrom: string | null = null;
const scratchQuat = new Quaternion();
const scratchDir = new Vector3();

export function ensurePartLogicNode(id: string, kind: CrazyPartKind) {
  const existing = contraptionGraph.getNode(id);
  if (existing) return existing;
  const spec = PART_LOGIC_SPECS[kind];
  if (!spec) return undefined;
  return contraptionGraph.addNode(id, spec.nodeKind, spec.defaultConfig ?? {}, {
    label: spec.label,
    bodyId: id,
  });
}

export function clearPendingWire(): void {
  pendingWireFrom = null;
  gameStore.setPendingWireFrom(null);
}

/**
 * Flujo de cableado en 2 pasos (apuntar origen -> apuntar destino).
 * Devuelve un mensaje corto para el HUD o null si se canceló.
 */
export function stepWireConnection(targetId: string | null): {
  status: 'pending' | 'connected' | 'disconnected' | 'cancelled' | 'invalid';
  message: string;
} {
  if (!targetId) {
    pendingWireFrom = null;
    gameStore.setPendingWireFrom(null);
    return { status: 'cancelled', message: 'Cable cancelado' };
  }
  const entry = grabbableRegistry.getById(targetId);
  const target = entry ? ensurePartLogicNode(entry.id, entry.kind) : undefined;
  if (!target) return { status: 'invalid', message: 'Esa pieza no admite cables' };
  if (!pendingWireFrom) {
    if (
      target.kind !== 'battery' &&
      target.kind !== 'switch' &&
      target.kind !== 'key_input' &&
      target.kind !== 'timer' &&
      target.kind !== 'and'
    ) {
      return { status: 'invalid', message: 'Apuntá primero a batería, asiento, interruptor, timer o puerta AND' };
    }
    pendingWireFrom = targetId;
    gameStore.setPendingWireFrom(targetId);
    return { status: 'pending', message: `${target.label} · Apuntá al destino y volvé a conectar` };
  }
  if (pendingWireFrom === targetId) {
    pendingWireFrom = null;
    gameStore.setPendingWireFrom(null);
    const enabled = target.kind === 'switch' ? contraptionGraph.toggleSwitch(targetId) : null;
    return { status: 'cancelled', message: enabled === null ? 'Cable cancelado' : enabled ? 'Interruptor encendido' : 'Interruptor apagado' };
  }
  if (
    target.kind !== 'motor' &&
    target.kind !== 'thruster' &&
    target.kind !== 'light' &&
    target.kind !== 'magnet' &&
    target.kind !== 'piston' &&
    target.kind !== 'and'
  ) {
    return { status: 'invalid', message: 'Apuntá a un motor, rueda, faro, propulsor, resorte, bocina, imán o puerta AND' };
  }
  const fromId = pendingWireFrom;
  pendingWireFrom = null;
  gameStore.setPendingWireFrom(null);
  const fromNode = contraptionGraph.getNode(fromId);
  const incoming = contraptionGraph.getWires().filter((wire) => wire.toNodeId === targetId);
  const existing = incoming.find((wire) => wire.fromNodeId === fromId);
  if (existing) {
    contraptionGraph.disconnect(existing.id);
    return { status: 'disconnected', message: 'Cable retirado' };
  }
  const toPort = target.kind === 'and'
    ? incoming.some((wire) => wire.toPort === 'a') ? 'b' : 'a'
    : fromNode?.kind === 'battery' ? 'power' : 'signal';
  if (incoming.some((wire) => wire.toPort === toPort)) {
    return {
      status: 'invalid',
      message: target.kind === 'and' ? 'Las dos entradas de la puerta AND están ocupadas'
        : toPort === 'power' ? 'Ya tiene batería conectada' : 'Ya tiene señal de control conectada',
    };
  }
  contraptionGraph.connect(fromId, targetId, { toPort });
  return { status: 'connected', message: `${toPort === 'power' ? 'Energía' : 'Control'} conectado a ${target.label}` };
}

export function getWiredEngineSignal(id: string): number | undefined {
  return contraptionGraph.hasIncoming(id) ? contraptionGraph.getOutput(id) : undefined;
}

export function getPartLogicOutput(id: string): number {
  if (activeTurbo.has(id) || manualPulses.has(id)) return 1;
  return contraptionGraph.hasIncoming(id) ? contraptionGraph.getOutput(id) : 0;
}

export function getMotorDirection(id: string): number {
  return (contraptionGraph.getNode(id)?.config.gain ?? 1) < 0 ? -1 : 1;
}

export function isPartWired(id: string): boolean {
  return contraptionGraph.hasConnection(id) || pendingWireFrom === id;
}

const manualPulses = new Map<string, number>();

export function toggleSwitchNode(id: string): string {
  const entry = grabbableRegistry.getById(id);
  const node = entry ? ensurePartLogicNode(entry.id, entry.kind) : contraptionGraph.getNode(id);
  if (!node || node.kind !== 'switch') return 'No es un interruptor';
  const active = contraptionGraph.toggleSwitch(id);
  return active ? 'Interruptor encendido' : 'Interruptor apagado';
}

export function setTimerPeriod(id: string, periodSec: number): string {
  const entry = grabbableRegistry.getById(id);
  const node = entry ? ensurePartLogicNode(entry.id, entry.kind) : contraptionGraph.getNode(id);
  if (!node || node.kind !== 'timer') return 'No es un temporizador';
  contraptionGraph.setNodeConfig(id, { periodSec });
  return `Pulso ajustado a ${periodSec.toFixed(1)}s`;
}

export function cycleTimerPeriod(id: string): string {
  const entry = grabbableRegistry.getById(id);
  const node = entry ? ensurePartLogicNode(entry.id, entry.kind) : contraptionGraph.getNode(id);
  if (!node || node.kind !== 'timer') return 'No es un temporizador';
  const current = node.config.periodSec ?? 1.4;
  const nextPeriod = current < 1.0 ? 1.4 : current < 2.2 ? 3.0 : 0.6;
  contraptionGraph.setNodeConfig(id, { periodSec: nextPeriod });
  return `Pulso ajustado a ${nextPeriod.toFixed(1)}s`;
}

export function invertMotorNode(id: string): string {
  const entry = grabbableRegistry.getById(id);
  const node = entry ? ensurePartLogicNode(entry.id, entry.kind) : contraptionGraph.getNode(id);
  if (node?.kind !== 'motor') return 'La pieza no tiene giro configurable';
  const nextGain = (node.config.gain ?? 1) >= 0 ? -1 : 1;
  contraptionGraph.setNodeConfig(id, { gain: nextGain });
  return nextGain < 0 ? 'Giro invertido' : 'Giro normal';
}

export function pulseActuator(id: string, durationSec = 0.65): string {
  const entry = grabbableRegistry.getById(id);
  const kind = entry && PART_LOGIC_SPECS[entry.kind]?.nodeKind;
  if (!entry || (kind !== 'thruster' && kind !== 'light' && kind !== 'magnet' && kind !== 'piston')) return 'La pieza no admite una prueba';
  ensurePartLogicNode(entry.id, entry.kind);
  manualPulses.set(id, durationSec);
  return 'Probando pieza…';
}

export function disconnectAllWires(id: string): string {
  const wires = contraptionGraph.getWires().filter((w) => w.fromNodeId === id || w.toNodeId === id);
  if (wires.length === 0) {
    if (pendingWireFrom === id) clearPendingWire();
    return 'Sin cables conectados';
  }
  for (const w of wires) contraptionGraph.disconnect(w.id);
  if (pendingWireFrom === id) clearPendingWire();
  return `Se quitaron ${wires.length} cable(s)`;
}

export function resetContraptionGraph(): void {
  activeTurbo.clear();
  manualPulses.clear();
  springCooldowns.clear();
  hornCooldowns.clear();
  pendingWireFrom = null;
  gameStore.setPendingWireFrom(null);
  for (const node of contraptionGraph.getNodes()) {
    contraptionGraph.removeNode(node.id);
  }
}

const scratchInvQuat = new Quaternion();
const scratchVel = new Vector3();

/**
 * Evalúa el grafo lógico y aplica fuerzas físicas a los actuadores cableados (motores, propulsores)
 * más sustentación aerodinámica a las alas (`wing`) y flotabilidad a los globos (`balloon`).
 */
const MAX_THRUST_ALTITUDE = 45;
const MAX_MOUNTED_THRUST_SPEED = 30;
const MAX_LOOSE_THRUST_SPEED = 16;
const MAX_BALLOON_ALTITUDE = 24;
const MAX_WIRE_STRETCH_SQ = 10 * 10;

function applyThrust(body: RapierRigidBody, impulse: number, mounted = true) {
  const pos = body.translation();
  if (pos.y > MAX_THRUST_ALTITUDE) return;
  const lv = body.linvel();
  const speed = Math.hypot(lv.x, lv.y, lv.z);
  const maxSpeed = mounted ? MAX_MOUNTED_THRUST_SPEED : MAX_LOOSE_THRUST_SPEED;
  if (speed >= maxSpeed) return;
  const altScale = pos.y > MAX_THRUST_ALTITUDE - 10 ? (MAX_THRUST_ALTITUDE - pos.y) / 10 : 1;
  const scaledImpulse = impulse * altScale * (mounted ? 1 : 0.35);
  scratchQuat.copy(body.rotation());
  scratchDir.set(0, 1, 0).applyQuaternion(scratchQuat).multiplyScalar(scaledImpulse);
  body.applyImpulse(scratchDir, true);
}

function triggerSpring(id: string, body: RapierRigidBody): void {
  if ((springCooldowns.get(id) ?? 0) > 0) return;
  applyThrust(body, 165);
  playSpringBoing();
  springCooldowns.set(id, 0.75);
}

function triggerHorn(id: string, body: RapierRigidBody, isMountedPart?: (id: string) => boolean): void {
  if ((hornCooldowns.get(id) ?? 0) > 0) return;
  playHornSfx();
  hornCooldowns.set(id, 0.65);
  const hPos = body.translation();
  const maxDistSq = 4.5 * 4.5;
  for (const other of grabbableRegistry.getAll()) {
    if (other.id === id) continue;
    if (isMountedPart?.(other.id)) continue;
    const ob = other.getBody();
    if (!ob || !ob.isValid() || !ob.isEnabled() || !ob.isDynamic()) continue;
    const op = ob.translation();
    const dx = op.x - hPos.x;
    const dy = op.y - hPos.y;
    const dz = op.z - hPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > 0.01 && distSq < maxDistSq) {
      const inv = 1 / Math.sqrt(distSq);
      ob.applyImpulse({ x: dx * inv * 12, y: Math.max(0.15, dy * inv) * 12, z: dz * inv * 12 }, true);
    }
  }
}

function tickCooldowns(map: Map<string, number>, dt: number): void {
  for (const [key, remaining] of map) {
    const next = remaining - dt;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  }
}

export function stepContraptionLogic(
  dt: number,
  keys: Record<string, boolean>,
  isDrivenWheel: (id: string) => boolean,
  turboParts?: readonly string[],
  isMountedPart?: (id: string) => boolean,
  skipForcesFor?: (id: string) => boolean,
): void {
  tickCooldowns(springCooldowns, dt);
  tickCooldowns(hornCooldowns, dt);

  activeTurbo.clear();
  if (turboParts) {
    for (const id of turboParts) {
      const entry = grabbableRegistry.getById(id);
      if (!entry) continue;
      const body = entry.getBody();
      if (!body?.isValid() || !body.isEnabled()) continue;
      const skipForce = Boolean(skipForcesFor?.(id));
      if (entry.kind === 'thruster' || entry.kind === 'canister') {
        activeTurbo.add(id);
        if (!skipForce) applyThrust(body, 420 * dt);
      } else if (entry.kind === 'fan') {
        activeTurbo.add(id);
        if (!skipForce) applyThrust(body, 195 * dt);
      } else if (entry.kind === 'spring') {
        activeTurbo.add(id);
        if (!skipForce) triggerSpring(id, body);
      } else if (entry.kind === 'horn') {
        activeTurbo.add(id);
        triggerHorn(id, body, isMountedPart);
      }
    }
  }
  // Sustentación aerodinámica pasiva para alas (`wing`) y flotabilidad constante para globos (`balloon`)
  for (const entry of grabbableRegistry.getAll()) {
    if (skipForcesFor?.(entry.id)) continue;
    if (entry.kind === 'balloon') {
      const body = entry.getBody();
      if (!body || !body.isValid() || !body.isEnabled() || !body.isDynamic()) continue;
      const pos = body.translation();
      const lv = body.linvel();
      const mounted = Boolean(isMountedPart?.(entry.id));
      if (!mounted) {
        // Los globos sueltos flotan suavemente cerca del suelo para poder agarrarlos sin irse al cielo
        if (pos.y < 0.85 && lv.y < 0.8) {
          const hover = 7.4 * Math.max(0, 1 - pos.y / 0.85) * dt;
          body.applyImpulse({ x: 0, y: hover, z: 0 }, true);
        }
        continue;
      }
      if (pos.y > MAX_BALLOON_ALTITUDE) continue;
      const altScale = pos.y > MAX_BALLOON_ALTITUDE - 6 ? (MAX_BALLOON_ALTITUDE - pos.y) / 6 : 1;
      const lift = 400 * altScale * Math.max(0, Math.min(1, (4.5 - lv.y) / 2)) * dt;
      if (lift > 0) body.applyImpulse({ x: 0, y: lift, z: 0 }, true);
      continue;
    }
    if (entry.kind !== 'wing') continue;
    const body = entry.getBody();
    if (!body || !body.isValid() || !body.isEnabled()) continue;
    const lv = body.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    if (speed < 0.8) continue;
    const r = body.rotation();
    scratchQuat.set(r.x, r.y, r.z, r.w);
    scratchInvQuat.copy(scratchQuat).invert();
    scratchVel.set(lv.x, lv.y, lv.z).applyQuaternion(scratchInvQuat);
    const forwardSpeed = Math.abs(scratchVel.z);
    const liftMag = Math.min(260, forwardSpeed * 14 + speed * 4) * dt;
    scratchDir.set(0, 1, 0).applyQuaternion(scratchQuat).multiplyScalar(liftMag);
    // Amortiguación vertical suave para planeo estable
    scratchDir.y -= lv.y * 1.1 * dt;
    body.applyImpulse({ x: scratchDir.x, y: scratchDir.y, z: scratchDir.z }, true);
  }

  // Actualizar pulsos manuales de prueba ("Probar")
  for (const [pulseId, remaining] of manualPulses) {
    const next = remaining - dt;
    if (next <= 0) manualPulses.delete(pulseId);
    else manualPulses.set(pulseId, next);
  }

  // Romper cables que se estiran demasiado al desprenderse una pieza en un choque
  if (contraptionGraph.hasWires()) {
    for (const wire of contraptionGraph.getWires()) {
      const fromNode = contraptionGraph.getNode(wire.fromNodeId);
      const toNode = contraptionGraph.getNode(wire.toNodeId);
      if (!fromNode?.bodyId || !toNode?.bodyId) continue;
      if (fromNode.bodyId === grabbableRegistry.carriedId || toNode.bodyId === grabbableRegistry.carriedId) continue;
      const bFrom = grabbableRegistry.getById(fromNode.bodyId)?.getBody();
      const bTo = grabbableRegistry.getById(toNode.bodyId)?.getBody();
      if (!bFrom?.isValid() || !bTo?.isValid() || !bFrom.isEnabled() || !bTo.isEnabled()) continue;
      const pA = bFrom.translation();
      const pB = bTo.translation();
      const dx = pA.x - pB.x;
      const dy = pA.y - pB.y;
      const dz = pA.z - pB.z;
      if (dx * dx + dy * dy + dz * dz > MAX_WIRE_STRETCH_SQ) {
        contraptionGraph.disconnect(wire.id);
      }
    }
  }

  if (!contraptionGraph.hasWires() && manualPulses.size === 0) return;
  if (contraptionGraph.hasWires()) contraptionGraph.evaluate(dt, { keys });
  for (const node of contraptionGraph.getNodes()) {
    if (!node.bodyId) continue;
    const sig = getPartLogicOutput(node.bodyId);
    if (Math.abs(sig) <= 0.05) continue;
    const entry = grabbableRegistry.getById(node.bodyId);
    const body = entry?.getBody();
    if (!entry || !body || !body.isValid() || !body.isEnabled()) continue;

    const spec = PART_LOGIC_SPECS[entry.kind];
    if (!spec) continue;
    if (entry.kind === 'spring' && sig > 0.5) {
      if (!skipForcesFor?.(entry.id)) triggerSpring(entry.id, body);
    } else if (entry.kind === 'horn' && sig > 0.5) {
      triggerHorn(entry.id, body, isMountedPart);
    } else if (spec.nodeKind === 'thruster' && spec.thrustForce) {
      if (!activeTurbo.has(entry.id) && !skipForcesFor?.(entry.id)) {
        applyThrust(body, spec.thrustForce * sig * dt, Boolean(isMountedPart?.(entry.id)));
      }
    } else if (spec.nodeKind === 'motor' && spec.spinTorque && !isDrivenWheel(entry.id)) {
      const r = body.rotation();
      scratchQuat.set(r.x, r.y, r.z, r.w);
      scratchDir.set(1, 0, 0).applyQuaternion(scratchQuat).multiplyScalar(spec.spinTorque * sig * dt);
      body.applyTorqueImpulse({ x: scratchDir.x, y: scratchDir.y, z: scratchDir.z }, true);
    } else if (spec.nodeKind === 'magnet' && sig > 0.5) {
      const mPos = body.translation();
      for (const other of grabbableRegistry.getAll()) {
        if (other.id === entry.id) continue;
        if (isMountedPart?.(other.id)) continue;
        const ob = other.getBody();
        if (!ob || !ob.isValid() || !ob.isEnabled() || !ob.isDynamic()) continue;
        const op = ob.translation();
        const dx = mPos.x - op.x;
        const dy = mPos.y - op.y;
        const dz = mPos.z - op.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > 0.25 && distSq < 3.6 * 3.6) {
          const inv = 1 / Math.sqrt(distSq);
          const pull = 22 * dt;
          ob.applyImpulse({ x: dx * inv * pull, y: dy * inv * pull + 3 * dt, z: dz * inv * pull }, true);
        }
      }
    }
  }
}
