export const INVENTION_SCHEMA_VERSION = 1 as const;
export const INVENTION_STORAGE_KEY = 'los-del-desguace.invention.v1';

export type PartType = 'chassis' | 'wheel' | 'engine' | 'seat' | 'cargo_rack';

export type ConnectionSlotId =
  | 'chassis_core'
  | 'wheel_fl'
  | 'wheel_fr'
  | 'wheel_rl'
  | 'wheel_rr'
  | 'seat_center'
  | 'engine_rear'
  | 'engine_front'
  | 'rack_rear';

export interface PartDefinition {
  type: PartType;
  label: string;
  shortHint: string;
  mass: number;
  requiredCount: number;
}

export interface ConnectionSlotDefinition {
  id: ConnectionSlotId;
  label: string;
  acceptedTypes: readonly PartType[];
  position: readonly [number, number, number];
  requiresChassis: boolean;
  exclusiveWith?: readonly ConnectionSlotId[];
}

export interface InventionDesign {
  version: typeof INVENTION_SCHEMA_VERSION;
  name: string;
  slots: Partial<Record<ConnectionSlotId, PartType>>;
}

export interface InventionValidation {
  isValid: boolean;
  hasChassis: boolean;
  wheelCount: number;
  hasEngine: boolean;
  hasSeat: boolean;
  hasRack: boolean;
  engineSlot: 'engine_rear' | 'engine_front' | null;
  totalMass: number;
  missingReasons: string[];
}

export const PART_CATALOG: Record<PartType, PartDefinition> = {
  chassis: {
    type: 'chassis',
    label: 'Chasis',
    shortHint: 'Estructura base tubular',
    mass: 22,
    requiredCount: 1,
  },
  wheel: {
    type: 'wheel',
    label: 'Rueda',
    shortHint: '4 puntos de apoyo',
    mass: 3.5,
    requiredCount: 4,
  },
  engine: {
    type: 'engine',
    label: 'Motor',
    shortHint: 'Tracción (trasero o delantero)',
    mass: 9,
    requiredCount: 1,
  },
  seat: {
    type: 'seat',
    label: 'Asiento',
    shortHint: 'Puesto y volante',
    mass: 4,
    requiredCount: 1,
  },
  cargo_rack: {
    type: 'cargo_rack',
    label: 'Soporte',
    shortHint: 'Caja trasera de carga (opcional)',
    mass: 6,
    requiredCount: 0,
  },
};

export const CONNECTION_SLOTS: readonly ConnectionSlotDefinition[] = [
  {
    id: 'chassis_core',
    label: 'Centro del chasis',
    acceptedTypes: ['chassis'],
    position: [0, 0.42, 0],
    requiresChassis: false,
  },
  {
    id: 'wheel_fl',
    label: 'Rueda delantera izq.',
    acceptedTypes: ['wheel'],
    position: [-0.92, 0.36, 0.96],
    requiresChassis: true,
  },
  {
    id: 'wheel_fr',
    label: 'Rueda delantera der.',
    acceptedTypes: ['wheel'],
    position: [0.92, 0.36, 0.96],
    requiresChassis: true,
  },
  {
    id: 'wheel_rl',
    label: 'Rueda trasera izq.',
    acceptedTypes: ['wheel'],
    position: [-0.96, 0.42, -0.96],
    requiresChassis: true,
  },
  {
    id: 'wheel_rr',
    label: 'Rueda trasera der.',
    acceptedTypes: ['wheel'],
    position: [0.96, 0.42, -0.96],
    requiresChassis: true,
  },
  {
    id: 'seat_center',
    label: 'Cabina / Asiento',
    acceptedTypes: ['seat'],
    position: [0, 0.64, 0.16],
    requiresChassis: true,
  },
  {
    id: 'engine_rear',
    label: 'Bahía motor trasero',
    acceptedTypes: ['engine'],
    position: [0.42, 0.66, -0.34],
    requiresChassis: true,
    exclusiveWith: ['engine_front'],
  },
  {
    id: 'engine_front',
    label: 'Capó motor delantero',
    acceptedTypes: ['engine'],
    position: [0, 0.66, 1.06],
    requiresChassis: true,
    exclusiveWith: ['engine_rear'],
  },
  {
    id: 'rack_rear',
    label: 'Soporte de carga',
    acceptedTypes: ['cargo_rack'],
    position: [0, 0.68, -0.98],
    requiresChassis: true,
  },
] as const;

export const SLOT_BY_ID: Record<ConnectionSlotId, ConnectionSlotDefinition> = Object.fromEntries(
  CONNECTION_SLOTS.map((s) => [s.id, s])
) as Record<ConnectionSlotId, ConnectionSlotDefinition>;

export const EMPTY_CART_DESIGN: InventionDesign = {
  version: INVENTION_SCHEMA_VERSION,
  name: 'Prototipo Propio',
  slots: {},
};

export const EXAMPLE_CART_DESIGN: InventionDesign = {
  version: INVENTION_SCHEMA_VERSION,
  name: 'Chatarra Móvil',
  slots: {
    chassis_core: 'chassis',
    wheel_fl: 'wheel',
    wheel_fr: 'wheel',
    wheel_rl: 'wheel',
    wheel_rr: 'wheel',
    seat_center: 'seat',
    engine_rear: 'engine',
    rack_rear: 'cargo_rack',
  },
};

export function checkSlotPlacement(
  design: InventionDesign,
  slotId: ConnectionSlotId,
  partType: PartType
): { valid: boolean; reason: string } {
  const slot = SLOT_BY_ID[slotId];
  if (!slot) {
    return { valid: false, reason: 'Punto de conexión desconocido.' };
  }
  if (slot.requiresChassis && design.slots.chassis_core !== 'chassis') {
    return { valid: false, reason: 'Colocá primero el chasis base en el centro.' };
  }
  if (!slot.acceptedTypes.includes(partType)) {
    return {
      valid: false,
      reason: `Un ${PART_CATALOG[partType].label.toLowerCase()} no encaja en "${slot.label}".`,
    };
  }
  if (slot.exclusiveWith) {
    for (const conflictId of slot.exclusiveWith) {
      if (design.slots[conflictId]) {
        return {
          valid: false,
          reason: `Ya hay un motor colocado en "${SLOT_BY_ID[conflictId].label}". Quitalo primero.`,
        };
      }
    }
  }
  return { valid: true, reason: `Listo para conectar en ${slot.label}.` };
}

export function validateInvention(design: InventionDesign): InventionValidation {
  const hasChassis = design.slots.chassis_core === 'chassis';
  const wheelSlots: ConnectionSlotId[] = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
  const wheelCount = wheelSlots.filter((id) => design.slots[id] === 'wheel').length;
  const hasRearEngine = design.slots.engine_rear === 'engine';
  const hasFrontEngine = design.slots.engine_front === 'engine';
  const hasEngine = hasRearEngine || hasFrontEngine;
  const engineSlot = hasRearEngine ? 'engine_rear' : hasFrontEngine ? 'engine_front' : null;
  const hasSeat = design.slots.seat_center === 'seat';
  const hasRack = design.slots.rack_rear === 'cargo_rack';

  let totalMass = 0;
  for (const part of Object.values(design.slots)) {
    if (part) totalMass += PART_CATALOG[part].mass;
  }

  const missingReasons: string[] = [];
  if (!hasChassis) missingReasons.push('Falta el chasis');
  if (wheelCount < 4) missingReasons.push(`Faltan ${4 - wheelCount} rueda(s)`);
  if (!hasEngine) missingReasons.push('Falta el motor');
  if (!hasSeat) missingReasons.push('Falta el asiento');

  return {
    isValid: missingReasons.length === 0,
    hasChassis,
    wheelCount,
    hasEngine,
    hasSeat,
    hasRack,
    engineSlot,
    totalMass,
    missingReasons,
  };
}

export function removePartFromDesign(
  design: InventionDesign,
  slotId: ConnectionSlotId
): InventionDesign {
  if (slotId === 'chassis_core') {
    // Removing the chassis clears dependent attached parts
    return {
      ...design,
      slots: {},
    };
  }
  const nextSlots = { ...design.slots };
  delete nextSlots[slotId];
  return {
    ...design,
    slots: nextSlots,
  };
}

export function serializeInvention(design: InventionDesign): string {
  return JSON.stringify(design);
}

export function parseAndValidateInvention(raw: string | null): InventionDesign | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== INVENTION_SCHEMA_VERSION) return null;
    if (!obj.slots || typeof obj.slots !== 'object') return null;

    const rawSlots = obj.slots as Record<string, unknown>;
    const cleanSlots: Partial<Record<ConnectionSlotId, PartType>> = {};
    const hasChassis = rawSlots.chassis_core === 'chassis';

    if (hasChassis) {
      cleanSlots.chassis_core = 'chassis';
      for (const slot of CONNECTION_SLOTS) {
        if (slot.id === 'chassis_core') continue;
        const candidate = rawSlots[slot.id];
        if (typeof candidate === 'string' && slot.acceptedTypes.includes(candidate as PartType)) {
          // Enforce mutual exclusivity (e.g. only one engine)
          const conflict = slot.exclusiveWith?.some((ex) => cleanSlots[ex] !== undefined);
          if (!conflict) {
            cleanSlots[slot.id] = candidate as PartType;
          }
        }
      }
    }

    return {
      version: INVENTION_SCHEMA_VERSION,
      name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.slice(0, 40) : 'Prototipo Propio',
      slots: cleanSlots,
    };
  } catch {
    return null;
  }
}

export function loadSavedInvention(): InventionDesign {
  if (typeof window === 'undefined') return EXAMPLE_CART_DESIGN;
  try {
    const raw = window.localStorage.getItem(INVENTION_STORAGE_KEY);
    const parsed = parseAndValidateInvention(raw);
    return parsed ?? EXAMPLE_CART_DESIGN;
  } catch {
    return EXAMPLE_CART_DESIGN;
  }
}

export function saveInvention(design: InventionDesign): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INVENTION_STORAGE_KEY, serializeInvention(design));
  } catch {
    // Ignore storage quota errors safely
  }
}
