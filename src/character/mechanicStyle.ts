/**
 * Personalización "Mecánicos Locos" para El Vestidor del Yunke (Los del Desguace).
 *
 * Incluye:
 * - Accesorios de cabeza (antiparras subidas/bajas, máscara de soldar abatible, casco chatarrero, pelo chamuscado).
 * - Accesorios bucales (cigarrillo con brasa y humo, escarbadientes, tornillo).
 * - Niveles de manchas de grasa/hollín y accesorios de cuello/espalda.
 * - Pool de partículas de humo sin allocations por frame (apto para 60 FPS en celular).
 * - Curva de animación del gesto "Pitada Pensativa" (`thinking_puff`) para mirar el invento.
 * - Serialización compacta para `localStorage` y sincronización en `RemotePlayers.tsx`.
 */

export type HeadgearKind =
  | 'none'
  | 'welding_goggles_up'
  | 'welding_goggles_down'
  | 'welding_mask_up'
  | 'welding_mask_down'
  | 'scrap_helmet'
  | 'singed_hair';

export type MouthPropKind = 'none' | 'cigarette' | 'toothpick' | 'bolt';

export type GreaseLevel = 'clean' | 'light' | 'heavy';

export type NeckOrBackProp = 'none' | 'bandana' | 'scrap_backpack' | 'tool_holster';

export interface MechanicStyleConfig {
  headgear: HeadgearKind;
  mouthProp: MouthPropKind;
  greaseLevel: GreaseLevel;
  neckOrBack: NeckOrBackProp;
  /** Color de acento para pañuelo, antiparras o detalles del overol. */
  accentColor: string;
}

export interface StyleOption<T extends string> {
  id: T;
  label: string;
  description: string;
}

export const HEADGEAR_OPTIONS: readonly StyleOption<HeadgearKind>[] = [
  { id: 'none', label: 'Sin accesorio', description: 'Cabeza descubierta.' },
  { id: 'welding_goggles_up', label: 'Antiparras en frente', description: 'Gafas de soldador listas para bajar.' },
  { id: 'welding_goggles_down', label: 'Antiparras puestas', description: 'Lentes oscuros de taller en los ojos.' },
  { id: 'welding_mask_up', label: 'Máscara arriba', description: 'Careta de soldar levantada.' },
  { id: 'welding_mask_down', label: 'Máscara bajada', description: 'Careta de soldar cerrada con visor.' },
  { id: 'scrap_helmet', label: 'Casco de chapa', description: 'Casco remachado hecho con chatarra.' },
  { id: 'singed_hair', label: 'Pelo chamuscado', description: 'Despeinado tras un cortocircuito.' },
];

export const MOUTH_PROP_OPTIONS: readonly StyleOption<MouthPropKind>[] = [
  { id: 'none', label: 'Nada', description: 'Sin accesorio bucal.' },
  { id: 'cigarette', label: 'Cigarrillo', description: 'Con brasa encendida e hilito de humo.' },
  { id: 'toothpick', label: 'Escarbadientes', description: 'Clásico de mecánico mirando el motor.' },
  { id: 'bolt', label: 'Tornillo en la boca', description: 'Por si te falta una tercera mano.' },
];

export const GREASE_OPTIONS: readonly StyleOption<GreaseLevel>[] = [
  { id: 'clean', label: 'Limpio', description: 'Recién llegado al desguace.' },
  { id: 'light', label: 'Manchas de grasa', description: 'Salpicaduras en mejillas y guantes.' },
  { id: 'heavy', label: 'Lleno de hollín', description: 'Sobrevivió a tres explosiones de motor.' },
];

export const NECK_BACK_OPTIONS: readonly StyleOption<NeckOrBackProp>[] = [
  { id: 'none', label: 'Nada', description: 'Overol libre.' },
  { id: 'bandana', label: 'Pañuelo al cuello', description: 'Pañuelo de taller teñido con el color acento.' },
  { id: 'scrap_backpack', label: 'Mochila chatarrera', description: 'Llaves, cables y repuestos en la espalda.' },
  { id: 'tool_holster', label: 'Cartuchera de taller', description: 'Cinturón con herramientas a mano.' },
];

export const DEFAULT_MECHANIC_STYLE: MechanicStyleConfig = {
  headgear: 'welding_goggles_up',
  mouthProp: 'none',
  greaseLevel: 'light',
  neckOrBack: 'bandana',
  accentColor: '#d96b27',
};

export interface MechanicPreset {
  id: string;
  label: string;
  style: MechanicStyleConfig;
}

export const MECHANIC_PRESETS: readonly MechanicPreset[] = [
  {
    id: 'chamuscado',
    label: 'El Chamuscado',
    style: {
      headgear: 'singed_hair',
      mouthProp: 'cigarette',
      greaseLevel: 'heavy',
      neckOrBack: 'scrap_backpack',
      accentColor: '#e05a2b',
    },
  },
  {
    id: 'jefa-yunke',
    label: 'Jefa del Yunke',
    style: {
      headgear: 'welding_goggles_up',
      mouthProp: 'toothpick',
      greaseLevel: 'light',
      neckOrBack: 'bandana',
      accentColor: '#f0b429',
    },
  },
  {
    id: 'soldador-nocturno',
    label: 'Soldador Nocturno',
    style: {
      headgear: 'welding_mask_down',
      mouthProp: 'none',
      greaseLevel: 'heavy',
      neckOrBack: 'tool_holster',
      accentColor: '#2d9cdb',
    },
  },
  {
    id: 'chatarrero-loco',
    label: 'Chatarrero Loco',
    style: {
      headgear: 'scrap_helmet',
      mouthProp: 'bolt',
      greaseLevel: 'light',
      neckOrBack: 'scrap_backpack',
      accentColor: '#6abf4b',
    },
  },
];

/** Parámetros visuales de grasa/hollín para aplicar al material del avatar. */
export function getGreaseMaterialParams(level: GreaseLevel): {
  smudgeOpacity: number;
  roughnessBoost: number;
  darkenFactor: number;
} {
  if (level === 'heavy') {
    return { smudgeOpacity: 0.85, roughnessBoost: 0.18, darkenFactor: 0.84 };
  }
  if (level === 'light') {
    return { smudgeOpacity: 0.42, roughnessBoost: 0.08, darkenFactor: 0.94 };
  }
  return { smudgeOpacity: 0, roughnessBoost: 0, darkenFactor: 1 };
}

/**
 * Alterna la máscara de soldar o las antiparras entre posición subida y bajada
 * (útil para bajar automáticamente la máscara al usar la Soldadora o la Amoladora).
 */
export function withProtectiveGearActive(
  style: MechanicStyleConfig,
  weldingOrGrinding: boolean,
): HeadgearKind {
  if (!weldingOrGrinding) return style.headgear;
  if (style.headgear === 'welding_mask_up') return 'welding_mask_down';
  if (style.headgear === 'welding_goggles_up') return 'welding_goggles_down';
  return style.headgear;
}

// ---------------------------------------------------------------------------
// Pool liviano de humo para el cigarrillo (5 partículas recicladas, 0 GC/frame)
// ---------------------------------------------------------------------------

export interface SmokePuff {
  x: number;
  y: number;
  z: number;
  age: number;
  maxAge: number;
  scale: number;
  opacity: number;
  driftPhase: number;
  active: boolean;
}

export interface CigaretteSmokePool {
  puffs: SmokePuff[];
  spawnTimer: number;
  /** Intensidad de la brasa (0.4 reposo, 1.0 durante pitada). */
  emberGlow: number;
}

const SMOKE_POOL_SIZE = 5;

export function createCigaretteSmokePool(): CigaretteSmokePool {
  const puffs: SmokePuff[] = [];
  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    puffs.push({
      x: 0,
      y: 0,
      z: 0,
      age: 0,
      maxAge: 1.35,
      scale: 0.03,
      opacity: 0,
      driftPhase: i * 1.3,
      active: false,
    });
  }
  return { puffs, spawnTimer: 0, emberGlow: 0.45 };
}

/**
 * Avanza las partículas de humo en espacio local respecto a la punta del cigarrillo.
 * Si `puffBurst` es true (durante el gesto pensativo), libera humo más seguido y aviva la brasa.
 */
export function stepCigaretteSmoke(
  pool: CigaretteSmokePool,
  dt: number,
  enabled: boolean,
  puffBurst = false,
) {
  const safeDt = Math.min(0.1, Math.max(0, dt));
  pool.emberGlow = enabled ? (puffBurst ? 1.0 : 0.45 + Math.sin(performance.now() * 0.004) * 0.1) : 0;

  const spawnInterval = puffBurst ? 0.16 : 0.34;
  if (enabled) {
    pool.spawnTimer += safeDt;
    if (pool.spawnTimer >= spawnInterval) {
      pool.spawnTimer = 0;
      const slot = pool.puffs.find((p) => !p.active) ?? pool.puffs[0];
      slot.active = true;
      slot.age = 0;
      slot.maxAge = puffBurst ? 1.5 : 1.25;
      slot.x = 0;
      slot.y = 0;
      slot.z = 0;
      slot.scale = puffBurst ? 0.045 : 0.025;
      slot.opacity = puffBurst ? 0.55 : 0.35;
      slot.driftPhase = (slot.driftPhase + 1.7) % (Math.PI * 2);
    }
  }

  for (const p of pool.puffs) {
    if (!p.active) continue;
    p.age += safeDt;
    if (p.age >= p.maxAge) {
      p.active = false;
      p.opacity = 0;
      continue;
    }
    const t = p.age / p.maxAge;
    p.y += safeDt * (0.28 + t * 0.15);
    p.x = Math.sin(p.driftPhase + p.age * 3.1) * (0.03 + t * 0.07);
    p.z = Math.cos(p.driftPhase + p.age * 2.4) * (0.02 + t * 0.05);
    p.scale = 0.025 + t * (puffBurst ? 0.13 : 0.085);
    p.opacity = (1 - t) * (1 - t) * (puffBurst ? 0.55 : 0.35);
  }
}

// ---------------------------------------------------------------------------
// Gesto #8: "Pitada Pensativa" (mirando el invento con actitud de taller)
// ---------------------------------------------------------------------------

export const THINKING_PUFF_GESTURE = {
  id: 'thinking_puff',
  label: 'Mmm... (Taller)',
  durationSec: 2.6,
} as const;

export interface ThinkingPuffPose {
  /** Inclinación lateral de cabeza (rad) evaluando el invento. */
  headTiltZ: number;
  /** Leve inclinación hacia arriba al exhalar (rad). */
  headPitchX: number;
  /** Elevación de mano derecha hacia la boca/mentón (0..1). */
  rightHandToMouth: number;
  /** Brazo izquierdo cruzado en el pecho (0..1). */
  leftArmCrossed: number;
  /** Activa bocanada de humo / brillo de brasa si tiene cigarrillo. */
  exhaleSmoke: boolean;
}

/**
 * Muestrea la pose del gesto pensativo entre `0` y `THINKING_PUFF_GESTURE.durationSec`.
 * Funciona igual de bien con cigarrillo, escarbadientes o sin nada (se rasca el mentón).
 */
export function sampleThinkingPuffPose(elapsedSec: number): ThinkingPuffPose {
  const dur = THINKING_PUFF_GESTURE.durationSec;
  const t = Math.max(0, Math.min(1, elapsedSec / dur));

  // Fase 1 (0..0.35): sube la mano y ladea la cabeza mirando el invento
  // Fase 2 (0.35..0.7): sostiene / inhala o piensa
  // Fase 3 (0.7..1.0): baja mano, levanta levemente el mentón y exhala humo
  const smooth = (x: number) => x * x * (3 - 2 * x);

  const armCross =
    t < 0.2 ? smooth(t / 0.2) : t > 0.85 ? smooth((1 - t) / 0.15) : 1;

  let handUp = 0;
  if (t < 0.28) handUp = smooth(t / 0.28);
  else if (t < 0.62) handUp = 1;
  else if (t < 0.82) handUp = smooth((0.82 - t) / 0.2);

  const exhaleSmoke = t >= 0.58 && t <= 0.88;
  const headTiltZ = Math.sin(t * Math.PI) * 0.16;
  const headPitchX = exhaleSmoke ? -0.12 * Math.sin(((t - 0.58) / 0.3) * Math.PI) : 0.05 * handUp;

  return {
    headTiltZ,
    headPitchX,
    rightHandToMouth: handUp,
    leftArmCrossed: armCross,
    exhaleSmoke,
  };
}

// ---------------------------------------------------------------------------
// Serialización segura (localStorage + multijugador)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'los-del-desguace.mechanic-style.v1';

export function serializeMechanicStyle(style: MechanicStyleConfig): string {
  return JSON.stringify(style);
}

export function deserializeMechanicStyle(raw: string | null | undefined): MechanicStyleConfig {
  if (!raw) return { ...DEFAULT_MECHANIC_STYLE };
  try {
    const parsed = JSON.parse(raw) as Partial<MechanicStyleConfig>;
    const validHead = HEADGEAR_OPTIONS.some((o) => o.id === parsed.headgear)
      ? parsed.headgear!
      : DEFAULT_MECHANIC_STYLE.headgear;
    const validMouth = MOUTH_PROP_OPTIONS.some((o) => o.id === parsed.mouthProp)
      ? parsed.mouthProp!
      : DEFAULT_MECHANIC_STYLE.mouthProp;
    const validGrease = GREASE_OPTIONS.some((o) => o.id === parsed.greaseLevel)
      ? parsed.greaseLevel!
      : DEFAULT_MECHANIC_STYLE.greaseLevel;
    const validBack = NECK_BACK_OPTIONS.some((o) => o.id === parsed.neckOrBack)
      ? parsed.neckOrBack!
      : DEFAULT_MECHANIC_STYLE.neckOrBack;
    const validColor =
      typeof parsed.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accentColor)
        ? parsed.accentColor
        : DEFAULT_MECHANIC_STYLE.accentColor;

    return {
      headgear: validHead,
      mouthProp: validMouth,
      greaseLevel: validGrease,
      neckOrBack: validBack,
      accentColor: validColor,
    };
  } catch {
    return { ...DEFAULT_MECHANIC_STYLE };
  }
}

export function loadMechanicStyle(): MechanicStyleConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_MECHANIC_STYLE };
  return deserializeMechanicStyle(window.localStorage.getItem(STORAGE_KEY));
}

export function saveMechanicStyle(style: MechanicStyleConfig) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, serializeMechanicStyle(style));
}