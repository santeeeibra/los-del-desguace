import { CONNECTION_SLOTS } from './inventionSchema';
import type { GrabbableKind } from '../props/grabbableRegistry';

export const WORKSHOP_ORIGIN: [number, number, number] = [2.05, 0.08, 5.9];
export const FREE_BUILD_ORIGIN: [number, number, number] = [5.25, 0.08, 6.9];
export const FREE_BUILD_SPARE_ORIGIN: [number, number, number] = [0.8, 0.08, -0.65];
export const DRUM_STAND_ORIGIN: [number, number, number] = [-3.1, 0, 6];
export type WorkshopPartType = 'wheel' | 'engine' | 'drum' | 'wing' | 'headlight' | 'seat' | 'thruster' | 'cargo_rack' | 'chassis' | 'battery' | 'gyro' | 'fan' | 'balloon' | 'fixture';
export type WorkshopStation = 'cart' | 'drum' | `custom:${string}`;
export type StarterBuildStep = 'wheels' | 'motor' | 'seat' | 'drive';

export function isCustomStation(station: WorkshopStation): station is `custom:${string}` {
  return station.startsWith('custom:');
}

export function customRootId(station: WorkshopStation): string | undefined {
  return isCustomStation(station) ? station.slice(7) : undefined;
}

export const WORKSHOP_PARTS: Partial<Record<GrabbableKind, WorkshopPartType>> = {
  wheel: 'wheel',
  part: 'engine',
  battery: 'battery',
  canister: 'drum',
  wing: 'wing',
  headlight: 'headlight',
  seat: 'seat',
  thruster: 'thruster',
  cargoRack: 'cargo_rack',
  chassis: 'chassis',
  gyro: 'gyro',
  fan: 'fan',
  balloon: 'balloon',
};

export function workshopPartTypeForKind(kind: GrabbableKind): WorkshopPartType {
  return WORKSHOP_PARTS[kind] ?? 'fixture';
}

export interface WorkshopMount {
  id: string;
  label: string;
  type: WorkshopPartType;
  station: WorkshopStation;
  transmission: string;
  parentId?: string;
  axle?: { x: number; y: number; z: number };
}

interface SlotDefinition {
  id: string;
  label: string;
  type: WorkshopPartType;
  position: readonly [number, number, number];
  station: WorkshopStation;
  transmission: string;
  axle?: { x: number; y: number; z: number };
  mountRotation?: { x: number; y: number; z: number; w: number };
}

function placeSlot(slot: SlotDefinition, origin: readonly [number, number, number]) {
  const [x, y, z] = slot.position;
  return {
    ...slot,
    worldPosition: { x: origin[0] + x, y: origin[1] + y, z: origin[2] + z },
  };
}

const cartSlots = CONNECTION_SLOTS.flatMap((slot) => {
  const type = slot.acceptedTypes[0];
  if (type !== 'wheel' && type !== 'engine') return [];

  const rear = slot.id === 'engine_rear' || slot.id === 'wheel_rl' || slot.id === 'wheel_rr';
  return [placeSlot({
    id: slot.id,
    label: slot.label,
    position: type === 'wheel' ? [slot.position[0], 0.36, slot.position[2]] : slot.position,
    type,
    station: 'cart',
    transmission: rear ? 'rear' : 'front',
    axle: type === 'wheel' ? { x: 1, y: 0, z: 0 } : undefined,
  }, WORKSHOP_ORIGIN)];
});

const drumSlots: SlotDefinition[] = [
  { id: 'drum_axle', label: 'Eje del tambor', type: 'drum', position: [0.32, 0.59, 0], station: 'drum',
    transmission: 'drum', axle: { x: 0, y: 1, z: 0 } },
  { id: 'drum_engine', label: 'Motor del tambor', type: 'engine', position: [-0.42, 0.42, 0], station: 'drum',
    transmission: 'drum' },
];

const accessorySlots: SlotDefinition[] = [
  { id: 'seat_center', label: 'Asiento del carrito', type: 'seat', position: [0, 0.78, 0.18], station: 'cart', transmission: '' },
  { id: 'wing_rear', label: 'Ala trasera', type: 'wing', position: [0, 0.63, -0.92], station: 'cart', transmission: '' },
  { id: 'wing_l', label: 'Ala izquierda', type: 'wing', position: [-1.18, 0.56, 0.08], station: 'cart', transmission: '' },
  { id: 'wing_r', label: 'Ala derecha', type: 'wing', position: [1.18, 0.56, 0.08], station: 'cart', transmission: '' },
  { id: 'light_fl', label: 'Faro izquierdo', type: 'headlight', position: [-0.49, 0.59, 1.32], station: 'cart', transmission: '' },
  { id: 'light_fr', label: 'Faro derecho', type: 'headlight', position: [0.49, 0.59, 1.32], station: 'cart', transmission: '' },
  { id: 'thruster_rear', label: 'Propulsor trasero', type: 'thruster', position: [0, 0.54, -1.60], station: 'cart', transmission: '',
    mountRotation: { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 } },
  { id: 'rack_rear', label: 'Soporte de carga', type: 'cargo_rack', position: [0, 0.54, -0.98], station: 'cart', transmission: '' },
];

export const WORKSHOP_SLOTS = [
  ...cartSlots,
  ...accessorySlots.map((slot) => placeSlot(slot, WORKSHOP_ORIGIN)),
  ...drumSlots.map((slot) => placeSlot(slot, DRUM_STAND_ORIGIN)),
];

export type WorkshopSlot = (typeof WORKSHOP_SLOTS)[number];
export const WORKSHOP_SLOT_BY_ID = new Map(WORKSHOP_SLOTS.map((slot) => [slot.id, slot]));
const SLOT_PART_LABEL: Record<WorkshopPartType, string> = {
  wheel: 'Rueda', engine: 'Motor', battery: 'Batería', drum: 'Bidón', wing: 'Ala', headlight: 'Faro', seat: 'Asiento', thruster: 'Propulsor', cargo_rack: 'Soporte', chassis: 'Chasis', gyro: 'Giroscopio', fan: 'Turbina', balloon: 'Globo', fixture: 'Pieza',
};

export function workshopMarkerOffset(slot: WorkshopSlot): [number, number, number] {
  if (slot.type === 'wheel') return [slot.position[0] * -0.17, 0, 0];
  if (slot.type === 'seat') return [0, -0.32, 0];
  if (slot.type === 'cargo_rack') return [0, -0.14, 0];
  if (slot.type === 'wing' || slot.type === 'headlight' || slot.type === 'thruster') return [0, -0.1, 0];
  return [0, -0.21, 0];
}

export class WorkshopAssembly {
  private mounted = new Map<string, WorkshopMount>();
  private occupied = new Set<string>();
  private mountHistory: string[] = [];

  canMount(slot: WorkshopSlot, type: WorkshopPartType): boolean {
    return slot.type === type && !this.occupied.has(slot.id) &&
      (type !== 'engine' || this.engineAt(slot.station) === undefined);
  }

  canMountOnPart(parentId: string, type: WorkshopPartType): boolean {
    const parent = this.mounted.get(parentId);
    if (!parent) return true;
    return type !== 'engine' || this.engineFor(parent.station, parent.transmission) === undefined;
  }

  describeSlot(slot: WorkshopSlot, cartReleased: boolean): string {
    if (this.occupied.has(slot.id)) return 'Encastre ocupado';
    if (slot.type === 'engine' && this.engineAt(slot.station)) return 'El carrito ya tiene un motor en el otro alojamiento';
    if (slot.station === 'cart' && cartReleased) return 'Fijá el carrito para montar';
    return `Acepta: ${SLOT_PART_LABEL[slot.type]}`;
  }

  describePartMount(parentId: string, type: WorkshopPartType, stationReleased: boolean, axle = false): string {
    const parent = this.mounted.get(parentId);
    if (parent && parent.station !== 'drum' && stationReleased) return 'Fijá la creación para montar';
    if (parent && type === 'engine' && this.engineFor(parent.station, parent.transmission)) {
      return 'Ese eje ya tiene un motor';
    }
    if (axle) return 'Unir eje a pieza';
    if (type === 'engine') return 'Unir motor a pieza';
    return 'Unir fijo a pieza';
  }

  mount(partId: string, slot: WorkshopSlot, type: WorkshopPartType): boolean {
    if (this.mounted.has(partId) || !this.canMount(slot, type)) return false;
    this.occupied.add(slot.id);
    this.mounted.set(partId, slot);
    this.mountHistory.push(partId);
    return true;
  }

  mountOnPart(
    partId: string,
    parentId: string,
    type: WorkshopPartType,
    axle?: { x: number; y: number; z: number },
    parentType: WorkshopPartType = 'fixture',
  ): WorkshopMount | null {
    if (partId === parentId || this.mounted.has(partId) || !this.canMountOnPart(parentId, type)) return null;
    let parent = this.mounted.get(parentId);
    if (!parent) {
      if (parentType === 'engine' && type === 'engine') return null;
      parent = {
        id: `root:${parentId}`,
        label: 'Creación',
        type: parentType,
        station: `custom:${parentId}`,
        transmission: 'custom',
      };
      this.mounted.set(parentId, parent);
    }
    const mount: WorkshopMount = {
      id: `part:${parentId}:${partId}`,
      label: parent.label,
      type,
      station: parent.station,
      transmission: parent.transmission,
      parentId,
      axle,
    };
    this.mounted.set(partId, mount);
    this.mountHistory.push(partId);
    return mount;
  }

  mountFreeOnCart(
    partId: string,
    type: WorkshopPartType,
    axle?: { x: number; y: number; z: number },
  ): WorkshopMount | null {
    if (this.mounted.has(partId)) return null;
    const mount: WorkshopMount = {
      id: `free:cart:${partId}`,
      label: 'Carrito',
      type,
      station: 'cart',
      transmission: 'free',
      axle,
    };
    this.mounted.set(partId, mount);
    this.mountHistory.push(partId);
    return mount;
  }

  hasBattery(station: WorkshopStation): boolean {
    for (const mount of this.mounted.values()) {
      if (mount.station === station && mount.type === 'battery') return true;
    }
    return false;
  }

  hasGyro(station: WorkshopStation): boolean {
    for (const mount of this.mounted.values()) {
      if (mount.station === station && mount.type === 'gyro') return true;
    }
    return false;
  }

  hasFlightPropulsion(station: WorkshopStation): boolean {
    for (const mount of this.mounted.values()) {
      if (
        mount.station === station &&
        (mount.type === 'thruster' ||
          mount.type === 'wing' ||
          mount.type === 'drum' ||
          mount.type === 'fan' ||
          mount.type === 'balloon')
      ) {
        return true;
      }
    }
    return false;
  }

  hasWheels(station: WorkshopStation): boolean {
    for (const mount of this.mounted.values()) {
      if (mount.station === station && mount.type === 'wheel') return true;
    }
    return false;
  }

  customStations(): WorkshopStation[] {
    const stations = new Set<WorkshopStation>();
    for (const mount of this.mounted.values()) {
      if (isCustomStation(mount.station)) stations.add(mount.station);
    }
    return Array.from(stations);
  }

  idsOnStation(station: WorkshopStation): string[] {
    const out: string[] = [];
    for (const [id, mount] of this.mounted) {
      if (mount.station === station) out.push(id);
    }
    return out;
  }

  private engineAt(station: WorkshopStation): WorkshopMount | undefined {
    for (const slot of this.mounted.values()) {
      if (slot.station === station && slot.type === 'engine') return slot;
    }
  }

  private engineFor(station: WorkshopStation, transmission: string): string | undefined {
    for (const [id, mounted] of this.mounted) {
      if (mounted.type === 'engine' && mounted.station === station && mounted.transmission === transmission) return id;
    }
  }

  isPowered(slot: WorkshopMount): boolean {
    return this.engineIdFor(slot) !== undefined;
  }

  engineIdFor(slot: WorkshopMount): string | undefined {
    if (!slot.axle) return undefined;
    const exact = this.engineFor(slot.station, slot.transmission);
    if (exact) return exact;
    if (slot.transmission === 'free') return this.engineOnStation(slot.station);
    return this.engineFor(slot.station, 'free');
  }

  engineOnStation(station: WorkshopStation): string | undefined {
    for (const [id, mounted] of this.mounted) {
      if (mounted.type === 'engine' && mounted.station === station) return id;
    }
  }

  private engineStopped(station: WorkshopStation, signal?: (id: string) => number | undefined): boolean {
    if (!signal) return false;
    for (const [id, slot] of this.mounted) {
      if (slot.station === station && slot.type === 'engine') return signal(id) === 0;
    }
    return false;
  }

  status(station: WorkshopStation, signal?: (id: string) => number | undefined, released = false): string {
    const engine = this.engineAt(station);
    let axleCount = 0;
    let poweredCount = 0;
    for (const slot of this.mounted.values()) {
      if (slot.station !== station || !slot.axle) continue;
      axleCount++;
      if (slot.transmission === engine?.transmission) poweredCount++;
    }
    if (station === 'drum') {
      if (poweredCount && this.engineStopped(station, signal)) return 'Tambor · Motor sin señal';
      if (poweredCount) return 'Tambor en marcha';
      return engine ? 'Falta el bidón en el eje' : axleCount ? 'Falta el motor del tambor' : 'Tambor · Montá un bidón y un motor';
    }
    if (isCustomStation(station)) {
      let count = 0;
      for (const slot of this.mounted.values()) {
        if (slot.station === station) count++;
      }
      const flags = `${released ? ' · Libre' : ''}${this.hasGyro(station) ? ' · Con giroscopio' : ''}`;
      if (poweredCount && this.engineStopped(station, signal)) return `Creación · ${count} piezas${flags} · Motor sin señal`;
      if (poweredCount) return `Creación · ${count} piezas${flags} · En marcha`;
      return `Creación · ${count} piezas${flags}`;
    }
    const hasSeat = this.occupied.has('seat_center');
    const hasRack = this.occupied.has('rack_rear');
    const extras = `${hasSeat ? ' · Con asiento' : ''}${hasRack ? ' · Con soporte' : ''}`;
    const progress = `Carrito · ${axleCount}/4 ruedas${extras}`;
    if (!engine) return `${progress} · Podés empujarlo sin motor`;
    if (!poweredCount) return `${progress} · Faltan ruedas en el eje ${engine.transmission === 'rear' ? 'trasero' : 'delantero'}`;
    if (this.engineStopped(station, signal)) return `${progress} · Motor sin señal`;
    return `${progress} · Tracción ${engine.transmission === 'rear' ? 'trasera' : 'delantera'}`;
  }

  starterBuildStep(): StarterBuildStep {
    for (const slot of WORKSHOP_SLOTS) {
      if (slot.station === 'cart' && slot.type === 'wheel' && !this.occupied.has(slot.id)) return 'wheels';
    }
    if (!this.engineAt('cart')) return 'motor';
    return this.occupied.has('seat_center') ? 'drive' : 'seat';
  }

  releasedCartStatus(signal?: (id: string) => number | undefined): string {
    const engine = this.engineAt('cart');
    if (engine && !this.engineStopped('cart', signal)) {
      for (const slot of this.mounted.values()) {
        if (slot.station === 'cart' && slot.axle && slot.transmission === engine.transmission) {
          return 'Carrito libre · Motor en marcha';
        }
      }
    }
    return 'Carrito libre · Empujalo o fijalo para montar';
  }

  isMounted(partId: string): boolean {
    return this.mounted.has(partId);
  }

  stationOf(partId: string): WorkshopStation | undefined {
    return this.mounted.get(partId)?.station;
  }

  *partsAt(station: WorkshopStation) {
    for (const [id, mount] of this.mounted) {
      if (mount.station === station) yield { id, mount };
    }
  }

  canUndo(): boolean {
    return this.mountHistory.some((id) => this.mounted.has(id));
  }

  popLastMounted(): string | undefined {
    while (this.mountHistory.length > 0) {
      const id = this.mountHistory.pop()!;
      if (this.mounted.has(id)) return id;
    }
    return undefined;
  }

  remove(partId: string): string[] {
    const slot = this.mounted.get(partId);
    if (!slot) return [];
    const removed: string[] = [];
    const queue = [partId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const entry = this.mounted.get(current);
      if (!entry) continue;
      if (!entry.parentId && !entry.id.startsWith('root:')) this.occupied.delete(entry.id);
      this.mounted.delete(current);
      removed.push(current);
      for (const [childId, childMount] of this.mounted) {
        if (childMount.parentId === current) queue.push(childId);
      }
    }
    if (slot.parentId) {
      const rootId = customRootId(slot.station);
      if (rootId && this.mounted.has(rootId)) {
        const hasChildren = Array.from(this.mounted.values()).some((m) => m.station === slot.station && m.parentId);
        if (!hasChildren) {
          this.mounted.delete(rootId);
          removed.push(rootId);
        }
      }
    }
    const removedSet = new Set(removed);
    this.mountHistory = this.mountHistory.filter((id) => !removedSet.has(id));
    return removed;
  }

  reset(): void {
    this.occupied.clear();
    this.mounted.clear();
    this.mountHistory = [];
  }
}

export function isRideableMount(partId: string, kind: GrabbableKind, assembly: WorkshopAssembly): boolean {
  const station = assembly.stationOf(partId);
  if (!station || station === 'drum') return false;
  if (kind === 'seat') return true;
  if ((kind === 'woodBarrel' || kind === 'crate' || kind === 'chassis') && isCustomStation(station)) {
    return assembly.idsOnStation(station).length >= 2;
  }
  return false;
}
