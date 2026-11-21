import { memo, useCallback, useEffect, useRef, useState } from 'react';
import './hud.css';
import { playEmoteSfx, playWoodClick } from '../audio/sfxEngine';
import {
  DEFAULT_CHARACTER_CUSTOMIZATION,
  EMOTE_BY_ID,
  EMOTE_CATALOG,
  HAIR_PRESETS,
  SKIN_PRESETS,
  WORKSHOP_COLOR_PRESETS,
  type CharacterCustomizationConfig,
  type EmoteId,
} from '../character/characterCustomization';
import { HEAD_SHAPE_OPTIONS } from '../character/faceRigController';
import type { QualityLevel } from '../config/visualConfig';
import { playerInput } from '../controls/playerInput';
import { WORKSHOP_SLOT_BY_ID } from '../invention/workshopAssembly';
import { buildBlueprintShareUrl, decodeBlueprintCode, deleteBlueprint, encodeBlueprintCode, PRESET_BLUEPRINTS, readBlueprintFromUrl, saveBlueprint } from '../logic/blueprintManager';
import { isPartWired, PART_LOGIC_SPECS } from '../logic/contraptionRegistry';
import { useArenaAndBridgeState } from '../modes/arenaAndBridge';
import { contractStore, useContractStore, WORKSHOP_CONTRACTS } from '../modes/contracts';
import { DeliveryHud, DELIVERY_DESCRIPTION, useDeliveryStatusText } from './DeliveryHud';
import { deliveryStore } from '../modes/delivery/deliveryStore';
import {
  GAME_MODE_LABELS,
  gameModeStore,
  RACE_CHECKPOINTS,
  useGameModeStore,
  type GameModeId,
} from '../modes/gameModes';
import { multiplayerStore, useMultiplayerStore } from '../multiplayer/multiplayerStore';
import type { GrabbableKind } from '../props/grabbableRegistry';
import type { InventoryKind } from '../state/inventory';
import {
  CAMERA_VIEW_LABELS,
  gameStore,
  MAX_EXTRA_PROPS,
  useGameStore,
  type TouchOverlayMode,
} from '../state/gameStore';
import { PropSlotIcon } from './PropSlotIcon';

const GAME_TITLE = 'TALLER EL YUNKE';
const GAME_SUBTITLE = 'Desguace Indie · Taller 3D';

const MODE_DESCRIPTIONS: Record<GameModeId, string> = {
  sandbox: 'Armá sin límites (barriles voladores, robots o autos), soldá donde quieras o probá los presets.',
  race: 'Armá tu vehículo y cruzá los 4 aros de la pista en el menor tiempo.',
  flight: 'Despegá con alas, globos o cohetes y alcanzá el aro aéreo del patio.',
  delivery: DELIVERY_DESCRIPTION,
};

function HexBolt({ className }: { className: string }) {
  return (
    <svg className={`wood-bolt ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      <polygon points="8,1 14,4.5 14,11.5 8,15 2,11.5 2,4.5" fill="#9eaab0" stroke="#2c1607" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="2.7" fill="#5e686d" stroke="#2c1607" strokeWidth="1.1" />
      <circle cx="7.2" cy="7.1" r="0.9" fill="#dce4e8" />
    </svg>
  );
}

const WoodBolts = memo(function WoodBolts() {
  return (
    <div className="wood-bolts" aria-hidden="true">
      <HexBolt className="tl" />
      <HexBolt className="tr" />
      <HexBolt className="bl" />
      <HexBolt className="br" />
    </div>
  );
});

const VirtualJoystick = memo(function VirtualJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });

  const updateFromClient = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxRadius = Math.min(58, rect.width * 0.35);
    if (maxRadius <= 0) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    setKnobOffset({ x: kx, y: ky });

    // Ecctrl expects +Y forward (up on screen = negative screen dy) and +X right
    const normX = kx / maxRadius;
    const normY = -ky / maxRadius;
    const deadzone = 0.12;
    const mag = Math.hypot(normX, normY);
    if (mag < deadzone) {
      playerInput.setTouchJoystick(0, 0);
    } else {
      playerInput.setTouchJoystick(normX, normY);
    }
  };

  const resetStick = useCallback(() => {
    pointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    playerInput.setTouchJoystick(0, 0);
  }, []);

  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (event.pointerId === pointerIdRef.current) resetStick();
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', resetStick);
    document.addEventListener('visibilitychange', resetStick);
    return () => {
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', resetStick);
      document.removeEventListener('visibilitychange', resetStick);
      if (!gameStore.getState().seated) playerInput.setTouchJoystick(0, 0);
    };
  }, [resetStick]);

  return (
    <div
      ref={baseRef}
      className="hud-interactive hud-joystick"
      aria-label="Joystick de movimiento"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (pointerIdRef.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        e.stopPropagation();
        pointerIdRef.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The window listeners still release the joystick if capture fails.
        }
        updateFromClient(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        updateFromClient(e.clientX, e.clientY);
      }}
      onLostPointerCapture={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        resetStick();
      }}
    >
      <div className="hud-stick-knob" style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }} />
    </div>
  );
});

const ITEM_LABELS: Record<InventoryKind, string> = {
  crate: 'Caja apilable',
  wheel: 'Rueda rodante',
  canister: 'Bidón',
  part: 'Motor',
  battery: 'Batería',
  woodBarrel: 'Barril de madera',
  wing: 'Ala',
  headlight: 'Faro',
  seat: 'Asiento',
  thruster: 'Propulsor',
  timerBox: 'Temporizador',
  switchBox: 'Interruptor',
  logicAnd: 'Puerta AND',
  magnet: 'Electroimán',
  chassis: 'Chasis',
  cargoRack: 'Soporte',
  spring: 'Resorte Saltarín',
  balloon: 'Globo de Helio',
  fan: 'Turbina Hélice',
  horn: 'Bocina Loca',
  gyro: 'Giroscopio',
  blueprint: 'Plano Guía',
};

const ITEM_SHORT: Record<InventoryKind, string> = {
  crate: 'Caja',
  wheel: 'Rueda',
  canister: 'Bidón',
  part: 'Motor',
  battery: 'Bat.',
  woodBarrel: 'Barril',
  wing: 'Ala',
  headlight: 'Faro',
  seat: 'Asiento',
  thruster: 'Cohete',
  timerBox: 'Timer',
  switchBox: 'Switch',
  logicAnd: 'AND',
  magnet: 'Imán',
  chassis: 'Chasis',
  cargoRack: 'Rack',
  spring: 'Resorte',
  balloon: 'Globo',
  fan: 'Turbina',
  horn: 'Bocina',
  gyro: 'Giro',
  blueprint: 'Plano',
};

const SPAWNER_ITEMS: readonly { kind: GrabbableKind; label: string }[] = [
  { kind: 'gyro', label: 'Giroscopio' },
  { kind: 'spring', label: 'Resorte Saltarín' },
  { kind: 'balloon', label: 'Globo de Helio' },
  { kind: 'fan', label: 'Turbina Hélice' },
  { kind: 'horn', label: 'Bocina Loca' },
  { kind: 'thruster', label: 'Cohete' },
  { kind: 'wheel', label: 'Rueda' },
  { kind: 'wing', label: 'Ala' },
  { kind: 'part', label: 'Motor' },
  { kind: 'battery', label: 'Batería' },
  { kind: 'magnet', label: 'Electroimán' },
  { kind: 'timerBox', label: 'Temporizador' },
  { kind: 'switchBox', label: 'Interruptor' },
  { kind: 'seat', label: 'Asiento' },
  { kind: 'cargoRack', label: 'Soporte' },
  { kind: 'woodBarrel', label: 'Barril' },
];

const BLOCKED_MESSAGES = {
  mount: 'Montaje bloqueado',
  drop: 'Sin espacio para soltar',
  rotate: 'Sin espacio para girar',
  move: 'Sin espacio para mover',
  inventory: 'Inventario lleno',
  laser: 'Elegí una superficie libre dentro del alcance',
  wired: 'Retirá el cable antes de guardar la pieza',
};

const InventorAvatarPreview = memo(function InventorAvatarPreview({
  config,
  activeEmote,
}: {
  config: CharacterCustomizationConfig;
  activeEmote: EmoteId | null;
}) {
  const colorPreset =
    WORKSHOP_COLOR_PRESETS.find((c) => c.id === config.colorPresetId) ?? WORKSHOP_COLOR_PRESETS[0];
  const skinPreset =
    SKIN_PRESETS.find((s) => s.id === config.skinPresetId) ?? SKIN_PRESETS[0];
  const hairPreset =
    HAIR_PRESETS.find((h) => h.id === config.hairPresetId) ?? HAIR_PRESETS[0];
  const emoteSpec = activeEmote ? EMOTE_BY_ID[activeEmote] : null;
  const expr = emoteSpec?.expression ?? 'happy';

  const headGeo =
    config.headShape === 'round'
      ? { rx: 28, ry: 25, cy: 56, eyeDx: 10.5 }
      : config.headShape === 'long'
        ? { rx: 21.5, ry: 28.5, cy: 55, eyeDx: 8.8 }
        : config.headShape === 'wide'
          ? { rx: 31, ry: 23, cy: 57, eyeDx: 12.2 }
          : { rx: 25, ry: 25.5, cy: 56, eyeDx: 10 };

  return (
    <div className="hud-avatar-preview">
      <div className="hud-avatar-frame">
        <svg viewBox="0 0 140 140" className="hud-avatar-svg" aria-label="Retrato en vivo del inventor">
          <defs>
            <radialGradient id="yunkeAvatarBg" cx="50%" cy="42%" r="60%">
              <stop offset="0%" stopColor="#fff3d1" />
              <stop offset="100%" stopColor="#d9a45b" />
            </radialGradient>
          </defs>
          <circle cx="70" cy="70" r="63" fill="url(#yunkeAvatarBg)" stroke="#2c1607" strokeWidth="3.5" />

          {/* Mochila chatarrera detrás de los hombros */}
          {config.backpackStyle === 'scrap_pack' && (
            <g>
              <rect x="25" y="76" width="90" height="44" rx="12" fill={colorPreset.backpack} stroke="#2c1607" strokeWidth="2.8" />
              <rect x="19" y="83" width="12" height="26" rx="5" fill="#c98a3b" stroke="#2c1607" strokeWidth="2.4" />
              <rect x="109" y="83" width="12" height="26" rx="5" fill="#78949e" stroke="#2c1607" strokeWidth="2.4" />
            </g>
          )}

          {/* Torso / Camisa de taller */}
          <path
            d="M 32 128 C 32 94, 47 86, 70 86 C 93 86, 108 94, 108 128 Z"
            fill={colorPreset.shirt}
            stroke="#2c1607"
            strokeWidth="3"
          />
          {/* Cuello / Detalle de remera o pañuelo */}
          <path
            d="M 55 88 L 70 101 L 85 88"
            fill="none"
            stroke={colorPreset.cuffAndRibbon}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Overol o Remera + Pantalón */}
          {config.outfitId === 'overol' ? (
            <g>
              <rect x="46" y="86" width="10" height="36" rx="3" fill={colorPreset.overallStrap} stroke="#2c1607" strokeWidth="2.4" />
              <rect x="84" y="86" width="10" height="36" rx="3" fill={colorPreset.overallStrap} stroke="#2c1607" strokeWidth="2.4" />
              <path
                d="M 43 101 L 97 101 L 101 128 L 39 128 Z"
                fill={colorPreset.overall}
                stroke="#2c1607"
                strokeWidth="2.8"
              />
              <rect x="57" y="107" width="26" height="15" rx="4" fill={colorPreset.overallStrap} stroke="#2c1607" strokeWidth="2" />
              <circle cx="51" cy="102" r="3.2" fill="#f7c143" stroke="#2c1607" strokeWidth="1.6" />
              <circle cx="89" cy="102" r="3.2" fill="#f7c143" stroke="#2c1607" strokeWidth="1.6" />
            </g>
          ) : (
            <g>
              <path
                d="M 40 116 L 100 116 L 104 128 L 36 128 Z"
                fill={colorPreset.overall}
                stroke="#2c1607"
                strokeWidth="2.6"
              />
              <line x1="36" y1="108" x2="48" y2="112" stroke={colorPreset.cuffAndRibbon} strokeWidth="3.5" strokeLinecap="round" />
              <line x1="104" y1="108" x2="92" y2="112" stroke={colorPreset.cuffAndRibbon} strokeWidth="3.5" strokeLinecap="round" />
            </g>
          )}

          {/* Cartuchera de herramientas */}
          {config.beltToolStyle === 'pouch' && (
            <g>
              <rect x="88" y="109" width="18" height="17" rx="4" fill="#7a441f" stroke="#2c1607" strokeWidth="2.2" />
              <path d="M 97 100 L 97 111" stroke="#b9c6cc" strokeWidth="4" strokeLinecap="round" />
              <circle cx="97" cy="99" r="3.5" fill="none" stroke="#b9c6cc" strokeWidth="2.4" />
            </g>
          )}

          {/* Cuello */}
          <rect x="61" y="74" width="18" height="16" rx="6" fill={skinPreset.skin} stroke="#2c1607" strokeWidth="2.6" />

          {/* Orejas */}
          <circle cx={70 - headGeo.rx - 2} cy={headGeo.cy + 2} r="6.2" fill={skinPreset.skin} stroke="#2c1607" strokeWidth="2.6" />
          <circle cx={70 + headGeo.rx + 2} cy={headGeo.cy + 2} r="6.2" fill={skinPreset.skin} stroke="#2c1607" strokeWidth="2.6" />

          {/* Pelo base trasero */}
          <ellipse
            cx="70"
            cy={headGeo.cy - headGeo.ry * 0.52}
            rx={headGeo.rx + 4}
            ry="16"
            fill={hairPreset.hairShadow}
            stroke="#2c1607"
            strokeWidth="2.6"
          />

          {/* Cabeza con forma dinámica */}
          <ellipse
            cx="70"
            cy={headGeo.cy}
            rx={headGeo.rx}
            ry={headGeo.ry}
            fill={skinPreset.skin}
            stroke="#2c1607"
            strokeWidth="3"
          />

          {/* Mejillas / Rubor */}
          <ellipse cx={70 - headGeo.eyeDx - 4} cy={headGeo.cy + 6} rx="5.2" ry="3.1" fill={skinPreset.blush} opacity="0.72" />
          <ellipse cx={70 + headGeo.eyeDx + 4} cy={headGeo.cy + 6} rx="5.2" ry="3.1" fill={skinPreset.blush} opacity="0.72" />

          {/* Cejas y Ojos según expresión */}
          {expr === 'surprise' ? (
            <g>
              <circle cx={70 - headGeo.eyeDx} cy={headGeo.cy - 1} r="4.6" fill="#fff" stroke="#2c1607" strokeWidth="2.2" />
              <circle cx={70 + headGeo.eyeDx} cy={headGeo.cy - 1} r="4.6" fill="#fff" stroke="#2c1607" strokeWidth="2.2" />
              <circle cx={70 - headGeo.eyeDx} cy={headGeo.cy - 1} r="2.1" fill="#2c1607" />
              <circle cx={70 + headGeo.eyeDx} cy={headGeo.cy - 1} r="2.1" fill="#2c1607" />
              <path d={`M ${65 - headGeo.eyeDx} ${headGeo.cy - 9} Q ${70 - headGeo.eyeDx} ${headGeo.cy - 13} ${75 - headGeo.eyeDx} ${headGeo.cy - 9}`} fill="none" stroke={hairPreset.hairShadow} strokeWidth="2.6" strokeLinecap="round" />
              <path d={`M ${65 + headGeo.eyeDx} ${headGeo.cy - 9} Q ${70 + headGeo.eyeDx} ${headGeo.cy - 13} ${75 + headGeo.eyeDx} ${headGeo.cy - 9}`} fill="none" stroke={hairPreset.hairShadow} strokeWidth="2.6" strokeLinecap="round" />
            </g>
          ) : expr === 'effort' || expr === 'disappointed' ? (
            <g>
              <line x1={65 - headGeo.eyeDx} y1={headGeo.cy - 1} x2={74 - headGeo.eyeDx} y2={headGeo.cy + 1} stroke="#2c1607" strokeWidth="2.8" strokeLinecap="round" />
              <line x1={66 + headGeo.eyeDx} y1={headGeo.cy + 1} x2={75 + headGeo.eyeDx} y2={headGeo.cy - 1} stroke="#2c1607" strokeWidth="2.8" strokeLinecap="round" />
              <line x1={65 - headGeo.eyeDx} y1={headGeo.cy - 7} x2={75 - headGeo.eyeDx} y2={headGeo.cy - 5} stroke={hairPreset.hairShadow} strokeWidth="2.8" strokeLinecap="round" />
              <line x1={65 + headGeo.eyeDx} y1={headGeo.cy - 5} x2={75 + headGeo.eyeDx} y2={headGeo.cy - 7} stroke={hairPreset.hairShadow} strokeWidth="2.8" strokeLinecap="round" />
            </g>
          ) : (
            <g>
              <circle cx={70 - headGeo.eyeDx} cy={headGeo.cy - 1} r="3.2" fill="#2c1607" />
              <circle cx={70 + headGeo.eyeDx} cy={headGeo.cy - 1} r="3.2" fill="#2c1607" />
              <circle cx={69 - headGeo.eyeDx} cy={headGeo.cy - 2} r="1.1" fill="#fff" />
              <circle cx={69 + headGeo.eyeDx} cy={headGeo.cy - 2} r="1.1" fill="#fff" />
              <path d={`M ${65 - headGeo.eyeDx} ${headGeo.cy - 7} Q ${70 - headGeo.eyeDx} ${headGeo.cy - 10} ${75 - headGeo.eyeDx} ${headGeo.cy - 7}`} fill="none" stroke={hairPreset.hairShadow} strokeWidth="2.5" strokeLinecap="round" />
              <path d={`M ${65 + headGeo.eyeDx} ${headGeo.cy - 7} Q ${70 + headGeo.eyeDx} ${headGeo.cy - 10} ${75 + headGeo.eyeDx} ${headGeo.cy - 7}`} fill="none" stroke={hairPreset.hairShadow} strokeWidth="2.5" strokeLinecap="round" />
            </g>
          )}

          {/* Nariz */}
          <path d={`M 70 ${headGeo.cy - 1} L 68 ${headGeo.cy + 5} L 72 ${headGeo.cy + 5}`} fill="none" stroke="#8f4f38" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Boca según expresión */}
          {expr === 'surprise' ? (
            <circle cx="70" cy={headGeo.cy + 13} r="4.8" fill="#5c2216" stroke="#2c1607" strokeWidth="2.2" />
          ) : expr === 'disappointed' ? (
            <path d={`M 62 ${headGeo.cy + 15} Q 70 ${headGeo.cy + 9} 78 ${headGeo.cy + 15}`} fill="none" stroke="#2c1607" strokeWidth="2.8" strokeLinecap="round" />
          ) : expr === 'effort' ? (
            <rect x="62" y={headGeo.cy + 11} width="16" height="5" rx="2.5" fill="#fff" stroke="#2c1607" strokeWidth="2.2" />
          ) : (
            <path d={`M 61 ${headGeo.cy + 11} Q 70 ${headGeo.cy + 19} 79 ${headGeo.cy + 11}`} fill="none" stroke="#2c1607" strokeWidth="2.8" strokeLinecap="round" />
          )}

          {/* Mechón de pelo o Casco de taller */}
          {config.hatStyle === 'hardhat' ? (
            <g>
              <path
                d={`M ${68 - headGeo.rx - 4} ${headGeo.cy - 10} C ${68 - headGeo.rx - 2} ${headGeo.cy - 37}, ${72 + headGeo.rx + 2} ${headGeo.cy - 37}, ${72 + headGeo.rx + 4} ${headGeo.cy - 10} Z`}
                fill={colorPreset.hardhat}
                stroke="#2c1607"
                strokeWidth="2.8"
              />
              <rect
                x="65"
                y={headGeo.cy - 34}
                width="10"
                height="22"
                rx="4"
                fill={colorPreset.hardhatCrest}
                stroke="#2c1607"
                strokeWidth="2"
              />
              <rect
                x={66 - headGeo.rx - 6}
                y={headGeo.cy - 13}
                width={(headGeo.rx + 6) * 2 + 8}
                height="6.5"
                rx="3.2"
                fill={colorPreset.hardhatCrest}
                stroke="#2c1607"
                strokeWidth="2.4"
              />
            </g>
          ) : (
            <path
              d={`M ${70 - headGeo.rx} ${headGeo.cy - 8} C ${56 - headGeo.rx * 0.4} ${headGeo.cy - 34}, 82 ${headGeo.cy - 38}, ${70 + headGeo.rx} ${headGeo.cy - 9} C 79 ${headGeo.cy - 16}, 61 ${headGeo.cy - 14}, ${70 - headGeo.rx} ${headGeo.cy - 8} Z`}
              fill={hairPreset.hair}
              stroke="#2c1607"
              strokeWidth="2.8"
            />
          )}

          {/* Antiparras en la frente */}
          {config.gogglesStyle === 'forehead' && (
            <g>
              <line
                x1={68 - headGeo.rx - 3}
                y1={headGeo.cy - 16}
                x2={72 + headGeo.rx + 3}
                y2={headGeo.cy - 16}
                stroke="#3d2310"
                strokeWidth="3.5"
              />
              <circle cx="59" cy={headGeo.cy - 16} r="7.5" fill="#7be3cb" stroke="#2c1607" strokeWidth="2.5" />
              <circle cx="81" cy={headGeo.cy - 16} r="7.5" fill="#7be3cb" stroke="#2c1607" strokeWidth="2.5" />
              <circle cx="57" cy={headGeo.cy - 18} r="2" fill="#fff" />
              <circle cx="79" cy={headGeo.cy - 18} r="2" fill="#fff" />
            </g>
          )}
        </svg>
        {emoteSpec && (
          <div className="hud-avatar-emote-badge" title={emoteSpec.subtitle}>
            <span>{emoteSpec.icon}</span>
            <strong>{emoteSpec.label}</strong>
          </div>
        )}
      </div>

      <div className="hud-avatar-meta">
        <div className="hud-menu-kicker">EL VESTIDOR DEL YUNKE</div>
        <h3>Chispa · Inventor Jefe</h3>
        <p>
          Los cambios se aplican en vivo sobre tu personaje 3D y se sincronizan con la sala multijugador.
        </p>
        <div className="hud-avatar-tags">
          <span className="hud-avatar-tag">{colorPreset.label}</span>
          <span className="hud-avatar-tag">
            {config.outfitId === 'overol' ? 'Overol de Taller' : 'Remera y Pantalón'}
          </span>
          <span className="hud-avatar-tag">
            Cabeza {HEAD_SHAPE_OPTIONS.find((h) => h.id === config.headShape)?.label ?? 'Base'}
          </span>
        </div>
        <button
          type="button"
          className="hud-ctx-btn"
          onClick={() => gameStore.setCharacterConfig(DEFAULT_CHARACTER_CUSTOMIZATION)}
        >
          Restaurar Look Original
        </button>
      </div>
    </div>
  );
});

export function HudOverlay() {
  const quality = useGameStore((s) => s.quality);
  const touchMode = useGameStore((s) => s.touchMode);
  const isTouchDevice = useGameStore((s) => s.isTouchDevice);
  const mouseLookMode = useGameStore((s) => s.mouseLookMode);
  const pointerLocked = useGameStore((s) => s.pointerLocked);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const cameraBanner = useGameStore((s) => s.cameraBanner);
  const nearbyTargetId = useGameStore((s) => s.nearbyTargetId);
  const nearbyTargetKind = useGameStore((s) => s.nearbyTargetKind);
  const nearbyTargetMounted = useGameStore((s) => s.nearbyTargetMounted);
  const nearbyTargetRideable = useGameStore((s) => s.nearbyTargetRideable);
  const workshopSlot = useGameStore((s) => s.workshopSlot);
  const aimedWorkshopSlot = useGameStore((s) => s.aimedWorkshopSlot);
  const laserHint = useGameStore((s) => s.laserHint);
  const wireHint = useGameStore((s) => s.wireHint);
  const towerNutFound = useGameStore((s) => s.towerNutFound);
  const pendingWireFrom = useGameStore((s) => s.pendingWireFrom);
  const laserPlacementReady = useGameStore((s) => s.laserPlacementReady);
  const partMountReady = useGameStore((s) => s.partMountReady);
  const workshopStatus = useGameStore((s) => s.workshopStatus);
  const cartMode = useGameStore((s) => s.cartMode);
  const canUndoMount = useGameStore((s) => s.canUndoMount);
  const seated = useGameStore((s) => s.seated);
  const seatedFlightMode = useGameStore((s) => s.seatedFlightMode);
  const wrenchEquipped = useGameStore((s) => s.wrenchEquipped);
  const wrenchAiming = useGameStore((s) => s.wrenchAiming);
  const wrenchAimLocked = useGameStore((s) => s.wrenchAimLocked);
  const wrenchAxis = useGameStore((s) => s.wrenchAxis);
  const wrenchTarget = useGameStore((s) => s.wrenchTarget);
  const inventorySlots = useGameStore((s) => s.inventorySlots);
  const inventorySelection = useGameStore((s) => s.inventorySelection);
  const carriedKind = useGameStore((s) => s.carriedKind);
  const impactFeedback = useGameStore((s) => s.impactFeedback);
  const dropBlockedHint = useGameStore((s) => s.dropBlockedHint);
  const showHelp = useGameStore((s) => s.showHelp);
  const sceneReady = useGameStore((s) => s.sceneReady);
  const blueprints = useGameStore((s) => s.blueprints);
  const activeGuideIndex = useGameStore((s) => s.activeGuideIndex);
  const spawnedProps = useGameStore((s) => s.spawnedProps);
  const characterConfig = useGameStore((s) => s.characterConfig);
  const activeEmote = useGameStore((s) => s.activeEmote);
  const gameMode = useGameModeStore((state) => state);
  const contractState = useContractStore((s) => s);
  const arenaBridge = useArenaAndBridgeState();
  const net = useMultiplayerStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !readBlueprintFromUrl());
  const [finishDismissed, setFinishDismissed] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<'play' | 'spawner' | 'contracts' | 'character' | 'blueprints' | 'settings'>('play');
  const [planName, setPlanName] = useState('');
  const [importCode, setImportCode] = useState('');
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [touchRunActive, setTouchRunActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFs = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    syncFs();
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    playWoodClick();
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const active = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
    try {
      if (active) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
        return;
      }
      if (root.requestFullscreen) {
        await root.requestFullscreen();
        return;
      }
      if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
        return;
      }
    } catch {
      // Fallback below for iOS / restricted browsers
    }
    window.scrollTo(0, 1);
    const isStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches;
    gameStore.setWireHint(
      isStandalone
        ? 'Ya estás en modo pantalla completa'
        : 'En iOS: tocá Compartir (↑) → «Agregar a inicio» para pantalla completa'
    );
  }, []);

  const activeContract = contractState.activeContractId
    ? WORKSHOP_CONTRACTS.find((c) => c.id === contractState.activeContractId) ?? null
    : null;
  const completedContractsCount = WORKSHOP_CONTRACTS.filter(
    (c) => (contractState.progress[c.id]?.bestNuts ?? 0) >= 1
  ).length;

  const openCharacterCreator = useCallback(() => {
    playWoodClick();
    if (gameStore.getState().cameraMode === 'firstPerson') {
      gameStore.setCameraMode('thirdPersonClose', false);
    }
    setWelcomeOpen(false);
    setEmotesOpen(false);
    setMenuTab('character');
    setMenuOpen(true);
  }, []);

  const isDelivery = gameMode.mode === 'delivery';
  const deliveryStatus = useDeliveryStatusText();
  const roundWon =
    (gameMode.mode === 'race' && gameMode.raceFinished) ||
    (gameMode.mode === 'flight' && gameMode.flightTargetReached);
  const showWelcome = sceneReady && welcomeOpen && !menuOpen;
  const showContractFinish = Boolean(sceneReady && contractState.completedNow && activeContract && !menuOpen && !showWelcome);
  const showFinish = sceneReady && roundWon && !finishDismissed && !menuOpen && !showWelcome && !activeContract;

  useEffect(() => {
    if (!roundWon) setFinishDismissed(false);
  }, [roundWon]);

  useEffect(() => {
    const modalActive = menuOpen || showWelcome || showFinish || showContractFinish;
    playerInput.menuOpen = modalActive || emotesOpen;
    if (modalActive || emotesOpen) {
      if (typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      playerInput.resetAll();
      setTouchRunActive(false);
    }
    if (modalActive) setEmotesOpen(false);
    return () => { playerInput.menuOpen = false; };
  }, [menuOpen, showWelcome, showFinish, showContractFinish, emotesOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !e.repeat) {
        if (performance.now() - playerInput.lastPointerLockExitAt < 180) return;
        playWoodClick();
        if (emotesOpen) setEmotesOpen(false);
        else setMenuOpen((prev) => !prev);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);
      if (e.code === 'KeyG' && !e.repeat && !isInputFocused && !menuOpen && !showWelcome && !showFinish && !showContractFinish) {
        playWoodClick();
        setEmotesOpen((prev) => !prev);
      } else if (
        e.code === 'KeyN' &&
        !e.repeat &&
        !isInputFocused &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !showWelcome &&
        !showFinish &&
        !showContractFinish
      ) {
        playWoodClick();
        setEmotesOpen(false);
        if (menuOpen && menuTab === 'spawner') {
          setMenuOpen(false);
        } else {
          setMenuTab('spawner');
          setMenuOpen(true);
        }
      } else if (emotesOpen && !e.repeat && !isInputFocused && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const emote = EMOTE_CATALOG.find(({ keyHint }) => e.code === `Digit${keyHint}`);
        if (emote) {
          e.preventDefault();
          gameStore.triggerEmote(emote.id);
          playEmoteSfx(emote.id);
          setEmotesOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, menuTab, showWelcome, showFinish, showContractFinish, emotesOpen]);

  const showTouch = touchMode === 'on' || (touchMode === 'auto' && isTouchDevice);
  const interactLabel = seated ? 'Bajar'
    : workshopSlot ? 'Montar'
    : partMountReady ? 'Soldar'
    : carriedKind ? (wrenchAiming ? 'Colocar' : 'Soltar')
    : nearbyTargetMounted ? (nearbyTargetRideable ? 'Subir' : 'Retirar')
    : 'Agarrar';
  const interactHint = showTouch ? interactLabel : `E · ${interactLabel}`;
  const slotInView = workshopSlot ?? aimedWorkshopSlot;
  const targetLabel = seated
    ? seatedFlightMode
      ? (showTouch
        ? 'Volando · ◀ ▶ Girar · 🚀 SUBIR · ⬇ BAJAR'
        : 'Volando · W/S Avanzar · A/D Girar · Espacio Subir/Cohetes · Shift Bajar · E Salir')
      : (showTouch
        ? 'Conduciendo · ◀ ▶ Doblar · Pedales'
        : 'Conduciendo · W/S Acelerar · A/D Doblar · Espacio Turbo')
    : slotInView ? WORKSHOP_SLOT_BY_ID.get(slotInView)?.label
    : carriedKind ? ITEM_LABELS[carriedKind] : nearbyTargetKind ? ITEM_LABELS[nearbyTargetKind] : null;
  const canInteract = seated || Boolean(workshopSlot || (carriedKind ? (!wrenchAiming || laserPlacementReady) : nearbyTargetKind));

  function cycleTouchMode() {
    const order: TouchOverlayMode[] = ['auto', 'on', 'off'];
    gameStore.setTouchMode(order[(order.indexOf(touchMode) + 1) % order.length]);
  }

  const hasBuildTools = Boolean(cartMode || canUndoMount || (wrenchEquipped && (carriedKind || wrenchTarget === 'piece')));
  const contextFeedback = dropBlockedHint
    ? BLOCKED_MESSAGES[dropBlockedHint]
    : wireHint ?? laserHint ?? workshopStatus;
  const activeContextText = pendingWireFrom
    ? `Cableando desde ${pendingWireFrom} → apuntá destino (${showTouch ? 'Cable' : 'L'})`
    : targetLabel ?? (wrenchTarget === 'base' ? 'Base en la mira' : null);

  const targetWired = Boolean(nearbyTargetId && isPartWired(nearbyTargetId));
  const showTargetControls = !seated && !carriedKind && Boolean(nearbyTargetId && nearbyTargetKind && PART_LOGIC_SPECS[nearbyTargetKind]);
  const showCarryControls = !seated && Boolean(carriedKind);
  const blueprintEquipped = !menuOpen && !seated && inventorySlots[inventorySelection]?.kind === 'blueprint';
  const activeGuide = PRESET_BLUEPRINTS[activeGuideIndex % PRESET_BLUEPRINTS.length];

  return (
    <div className="hud-layer" data-scene-ready={sceneReady ? 'true' : 'false'}>
      {(cameraMode === 'firstPerson' || wrenchAiming) && (
        <div className="hud-reticle" data-target={Boolean(workshopSlot || aimedWorkshopSlot || nearbyTargetKind || wrenchTarget || laserPlacementReady)}
          data-wrench={wrenchAiming} aria-hidden="true" />
      )}
      {cameraBanner && <div className="hud-toast" role="status">{cameraBanner}</div>}

      <div className="hud-header">
        <div className="hud-header-left">
          <div className="hud-pill-status" aria-label="Estado del modo">
            <span className="hud-led" data-ready={sceneReady} aria-hidden="true" />
            <span>
              {!sceneReady ? 'Cargando…'
                : activeContract
                  ? activeContract.id === 'robot-arena'
                    ? `Robots ${arenaBridge.robotsKnockedOut}/${arenaBridge.totalRobots} · ${contractState.elapsedSec.toFixed(1)}s`
                    : activeContract.id === 'aerial-duel'
                      ? `Drones ${arenaBridge.dronesDestroyed}/${arenaBridge.totalDrones} · ${contractState.elapsedSec.toFixed(1)}s`
                      : activeContract.id === 'poly-bridge'
                        ? `${arenaBridge.bridgeCollapsed ? '¡Puente roto!' : `Puente ${arenaBridge.bridgeIntegrity}%`} · ${contractState.elapsedSec.toFixed(1)}s`
                        : `${activeContract.title} · ${contractState.elapsedSec.toFixed(1)}s`
                  : gameMode.mode === 'race'
                    ? gameMode.raceFinished ? `Meta ${gameMode.elapsedSec.toFixed(1)}s`
                      : `Aro ${gameMode.checkpointIndex + 1}/${RACE_CHECKPOINTS.length} · ${gameMode.elapsedSec.toFixed(1)}s`
                    : gameMode.mode === 'flight'
                      ? `Vuelo ${gameMode.currentFlightMeters.toFixed(1)}m`
                      : gameMode.mode === 'delivery'
                        ? deliveryStatus
                        : 'Taller Libre'}
            </span>
          </div>
          {sceneReady && (contractState.canRepairLastBuild || contractState.brokenWeldsCount > 0) && (
            <button
              type="button"
              className={`hud-button hud-interactive hud-repair-btn${contractState.brokenWeldsCount > 0 ? ' is-urgent' : ''}`}
              onClick={() => playerInput.triggerCartAction('repair')}
            >
              Reparar (1 clic){contractState.brokenWeldsCount > 0 ? ` (${contractState.brokenWeldsCount})` : ''}{!showTouch && <kbd>H</kbd>}
            </button>
          )}
          {sceneReady && (activeContract || gameMode.mode !== 'sandbox') && (
            <div className="hud-interactive" style={{ display: 'flex', gap: '5px' }}>
              <button type="button" className="hud-ctx-btn" onClick={() =>
                activeContract ? contractStore.startContract(activeContract.id) : isDelivery ? deliveryStore.start() : gameModeStore.resetRun()}>
                Reintentar
              </button>
              <button type="button" className="hud-ctx-btn is-accent" onClick={() => {
                contractStore.clearContract();
                gameModeStore.setMode('sandbox');
              }}>
                Taller
              </button>
            </div>
          )}
          {sceneReady && seated && (
            <div className="hud-interactive" style={{ display: 'flex', gap: '5px' }}>
              <button
                type="button"
                className="hud-ctx-btn is-danger"
                onClick={() => playerInput.triggerInteract()}
              >
                Bajar{!showTouch && <kbd>E</kbd>}
              </button>
              {!contractState.canRepairLastBuild && contractState.brokenWeldsCount === 0 && (
                <button type="button" className="hud-ctx-btn is-accent" onClick={() => gameStore.triggerReset()}>
                  Reiniciar piezas
                </button>
              )}
            </div>
          )}
        </div>

        {(activeEmote || activeContextText || contextFeedback || showTargetControls || showCarryControls) && (
          <div className="hud-context-stack">
            {activeEmote && EMOTE_BY_ID[activeEmote] && (
              <div className="hud-context-pill hud-emote-toast" role="status">
                <span className="hud-emote-toast-icon" aria-hidden="true">
                  {EMOTE_BY_ID[activeEmote].icon}
                </span>
                <span className="hud-context-main">
                  {EMOTE_BY_ID[activeEmote].label} — {EMOTE_BY_ID[activeEmote].subtitle}
                </span>
              </div>
            )}

            {(activeContextText || contextFeedback) && (
              <div className="hud-context-pill" data-mount={Boolean(workshopSlot)} role="status">
                {activeContextText && <span className="hud-context-main">{activeContextText}</span>}
                {sceneReady && canInteract && <kbd>{interactHint}</kbd>}
                {contextFeedback && (
                  <span className={dropBlockedHint ? 'hud-context-err' : 'hud-context-sub'}>
                    {contextFeedback}
                  </span>
                )}
              </div>
            )}

            {showCarryControls && (
              <div className="hud-context-actions hud-interactive" aria-label="Acciones de pieza en mano">
                {!isDelivery && (
                  <button type="button" className="hud-ctx-btn is-accent" onClick={() => playerInput.triggerPartAction('weld')}>
                    Soldar aquí{!showTouch && <kbd>F</kbd>}
                  </button>
                )}
                <button type="button" className="hud-ctx-btn" onClick={() => playerInput.triggerCartAction('rotate')}>
                  Girar ↷{!showTouch && <kbd>R</kbd>}
                </button>
              </div>
            )}

            {showTargetControls && nearbyTargetKind && (
              <div className="hud-context-actions hud-interactive" aria-label="Acciones de pieza">
                {nearbyTargetRideable && (
                  <button type="button" className="hud-ctx-btn is-accent" onClick={() => playerInput.triggerPartAction('ride')}>
                    Subir{!showTouch && <kbd>J</kbd>}
                  </button>
                )}
                {!isDelivery && (nearbyTargetKind === 'switchBox' || nearbyTargetKind === 'crate') && (
                  <button type="button" className="hud-ctx-btn is-accent" onClick={() => playerInput.triggerPartAction('toggle-switch')}>
                    Encender / Apagar{!showTouch && <kbd>F</kbd>}
                  </button>
                )}
                {nearbyTargetKind === 'timerBox' && (
                  <>
                    <button type="button" className="hud-ctx-btn" onClick={() => playerInput.triggerPartAction('timer-fast')}>0.6s</button>
                    <button type="button" className="hud-ctx-btn" onClick={() => playerInput.triggerPartAction('timer-med')}>1.4s</button>
                    <button type="button" className="hud-ctx-btn" onClick={() => playerInput.triggerPartAction('timer-slow')}>3.0s</button>
                  </>
                )}
                {(nearbyTargetKind === 'thruster' ||
                  nearbyTargetKind === 'canister' ||
                  nearbyTargetKind === 'headlight' ||
                  nearbyTargetKind === 'magnet' ||
                  nearbyTargetKind === 'spring' ||
                  nearbyTargetKind === 'fan' ||
                  nearbyTargetKind === 'horn') && (
                  <button type="button" className="hud-ctx-btn is-accent" onClick={() => playerInput.triggerPartAction('test-pulse')}>
                    Probar{!showTouch && <kbd>F</kbd>}
                  </button>
                )}
                {(nearbyTargetKind === 'wheel' || nearbyTargetKind === 'part') && (
                  <button type="button" className="hud-ctx-btn" onClick={() => playerInput.triggerPartAction('invert-motor')}>
                    Invertir giro{!showTouch && <kbd>O</kbd>}
                  </button>
                )}
                {!isDelivery && (
                <button type="button" className="hud-ctx-btn is-wire" onClick={() => playerInput.requestWire()}>
                  {pendingWireFrom ? 'Conectar aquí' : 'Cablear'}{!showTouch && <kbd>L</kbd>}
                </button>
                )}
                {targetWired && !isDelivery && (
                  <button type="button" className="hud-ctx-btn is-danger" onClick={() => playerInput.triggerPartAction('unwire')}>
                    Quitar cables{!showTouch && <kbd>K</kbd>}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="hud-utilities hud-interactive">
          <div className="hud-utility-bar">
            {!seated && hasBuildTools && (
              <button type="button" className="hud-button" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
                Armar
              </button>
            )}
            {!seated && !isDelivery && (
              <button type="button" className="hud-button hud-wrench" aria-pressed={wrenchEquipped} onClick={() => gameStore.toggleWrench()}>
                Llave{!showTouch && <kbd>X</kbd>}
              </button>
            )}
            {!seated && wrenchEquipped && !isDelivery && (
              <button
                type="button"
                className="hud-button hud-wrench"
                aria-pressed={wrenchAiming}
                title="Mira láser manos libres (M)"
                onClick={() => gameStore.toggleWrenchAimLock()}
              >
                Mira{!showTouch && <kbd>M</kbd>}
              </button>
            )}
            <button
              type="button"
              className="hud-button"
              aria-expanded={emotesOpen}
              title="Gestos del inventor (G)"
              onClick={() => {
                playWoodClick();
                setEmotesOpen((prev) => !prev);
              }}
            >
              Gestos{!showTouch && <kbd>G</kbd>}
            </button>
            <button type="button" className="hud-button" title="Cambiar cámara (V)" onClick={() => gameStore.cycleCameraMode()}>
              {CAMERA_VIEW_LABELS[cameraMode].short}
            </button>
            <button
              type="button"
              className="hud-button"
              aria-pressed={isFullscreen}
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa (PC / iOS)'}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? '🗗' : '⛶'}
            </button>
            <button
              type="button"
              className="hud-button"
              aria-expanded={menuOpen}
              onClick={() => {
                playWoodClick();
                setMenuOpen(!menuOpen);
              }}
            >
              Menú{!showTouch && <kbd>Esc</kbd>}
            </button>
          </div>

          {emotesOpen && !menuOpen && (
            <div className="hud-emote-panel wood-sign hud-interactive" role="dialog" aria-label="Barra de gestos">
              <WoodBolts />
              <div className="hud-emote-head">
                <span>GESTOS DEL TALLER</span>
                <button
                  type="button"
                  className="hud-ctx-btn"
                  onClick={() => {
                    playWoodClick();
                    setEmotesOpen(false);
                  }}
                >
                  Cerrar
                </button>
              </div>
              <div className="hud-emote-grid">
                {EMOTE_CATALOG.map((emote) => (
                  <button
                    key={emote.id}
                    type="button"
                    className="hud-emote-btn"
                    aria-pressed={activeEmote === emote.id}
                    title={emote.subtitle}
                    onClick={() => {
                      gameStore.triggerEmote(emote.id);
                      playEmoteSfx(emote.id);
                      setEmotesOpen(false);
                    }}
                  >
                    <span className="hud-emote-icon" aria-hidden="true">{emote.icon}</span>
                    <span className="hud-emote-label">{emote.label}</span>
                    {!showTouch && <kbd>{emote.keyHint}</kbd>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="hud-menu-backdrop hud-interactive" role="dialog" aria-modal="true" aria-label="Menú principal">
          <div className="hud-menu-card wood-sign">
            <WoodBolts />
            <div className="hud-menu-header">
              <div>
                <div className="hud-menu-kicker">{GAME_SUBTITLE.toUpperCase()}</div>
                <h2>{GAME_TITLE}</h2>
              </div>
              <button type="button" className="hud-button hud-menu-close" onClick={() => { playWoodClick(); setMenuOpen(false); }}>
                Reanudar{!showTouch && <kbd>Esc</kbd>}
              </button>
            </div>

            <div className="hud-menu-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={menuTab === 'play'} className="hud-menu-tab" onClick={() => { playWoodClick(); setMenuTab('play'); }}>
                Taller y Modos
              </button>
              <button type="button" role="tab" aria-selected={menuTab === 'spawner'} className="hud-menu-tab" onClick={() => { playWoodClick(); setMenuTab('spawner'); }}>
                Piezas
              </button>
              <button type="button" role="tab" aria-selected={menuTab === 'contracts'} className="hud-menu-tab" onClick={() => { playWoodClick(); setMenuTab('contracts'); }}>
                Encargos ({completedContractsCount}/{WORKSHOP_CONTRACTS.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={menuTab === 'character'}
                className="hud-menu-tab"
                onClick={() => {
                  playWoodClick();
                  if (cameraMode === 'firstPerson') {
                    gameStore.setCameraMode('thirdPersonClose', false);
                  }
                  setMenuTab('character');
                }}
              >
                Vestidor (Personaje)
              </button>
              <button type="button" role="tab" aria-selected={menuTab === 'blueprints'} className="hud-menu-tab" onClick={() => { playWoodClick(); setMenuTab('blueprints'); }}>
                Planos ({PRESET_BLUEPRINTS.length + blueprints.length})
              </button>
              <button type="button" role="tab" aria-selected={menuTab === 'settings'} className="hud-menu-tab" onClick={() => { playWoodClick(); setMenuTab('settings'); }}>
                Ajustes y Controles
              </button>
            </div>

            {menuTab === 'play' && (
              <div className="hud-menu-body">
                <div className="hud-menu-grid">
                  <button type="button" className="hud-menu-action is-primary" onClick={() => { playWoodClick(); setMenuOpen(false); }}>
                    <strong>Volver al Taller</strong>
                    <span>Seguir construyendo y probando en pista</span>
                  </button>
                  <button type="button" className="hud-menu-action" onClick={() => { gameStore.triggerReset(); setMenuOpen(false); }}>
                    <strong>Reiniciar Piezas</strong>
                    <span>Devolver todo a su posición inicial</span>
                  </button>
                </div>
                <div className="hud-menu-subtitle">Modo de juego</div>
                <div className="hud-menu-presets">
                  {(['sandbox', 'delivery', 'race', 'flight'] as GameModeId[]).map((m) => (
                    <button key={m} type="button" className="hud-button" aria-pressed={gameMode.mode === m}
                      onClick={() => { contractStore.clearContract(); gameModeStore.setMode(m); setMenuOpen(false); }}>
                      {GAME_MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
                <div className="hud-menu-subtitle">
                  Avatares entre pestañas {net.role === 'offline' ? '' : `· ${net.roomCode} · ${Object.keys(net.players).length}/6`}
                </div>
                <div className="hud-menu-presets">
                  {net.role === 'offline' ? (
                    <>
                      <button type="button" className="hud-button" onClick={() => multiplayerStore.hostRoom('YUNKE-1', 'Host')}>
                        Crear Sala (Host)
                      </button>
                      <button type="button" className="hud-button" onClick={() => multiplayerStore.joinRoom('YUNKE-1', 'Compañero')}>
                        Unirse a YUNKE-1
                      </button>
                    </>
                  ) : (
                    <button type="button" className="hud-button" onClick={() => multiplayerStore.leaveRoom()}>
                      Salir de {net.roomCode}
                    </button>
                  )}
                </div>
                {!isDelivery && (<>
                <div className="hud-menu-subtitle">Inventos Sin Ruedas (Barril, Robot, Globos)</div>
                <div className="hud-menu-presets">
                  {PRESET_BLUEPRINTS.filter((bp) => bp.category === 'free').map((bp) => (
                    <button key={bp.id} type="button" className="hud-button is-accent" disabled={!sceneReady || seated}
                      onClick={() => { playerInput.triggerBlueprintAction({ type: 'load', blueprint: bp }); setMenuOpen(false); }}>
                      Cargar · {bp.name}
                    </button>
                  ))}
                </div>
                </>)}
                <div className="hud-menu-subtitle">Arranque rápido con presets</div>
                <div className="hud-menu-presets">
                  {PRESET_BLUEPRINTS.filter((bp) => bp.category !== 'free').map((bp) => (
                    <button key={bp.id} type="button" className="hud-button" disabled={!sceneReady || seated}
                      onClick={() => { playerInput.triggerBlueprintAction({ type: 'load', blueprint: bp }); setMenuOpen(false); }}>
                      Cargar · {bp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menuTab === 'spawner' && (
              <div className="hud-menu-body">
                <div className="hud-spawner-head">
                  <span>
                    Piezas extra en taller: <strong>{spawnedProps.length}/{MAX_EXTRA_PROPS}</strong>
                  </span>
                  <button
                    type="button"
                    className="hud-button"
                    disabled={spawnedProps.length === 0}
                    onClick={() => {
                      playWoodClick();
                      gameStore.requestClearExtraParts();
                    }}
                  >
                    Limpiar extras
                  </button>
                </div>
                {wireHint && <div className="hud-workshop-status" role="status">{wireHint}</div>}
                <div className="hud-spawner-grid" aria-label="Dispensador de chatarra">
                  {SPAWNER_ITEMS.map(({ kind, label }) => (
                    <button
                      key={kind}
                      type="button"
                      className="hud-spawner-btn"
                      onClick={() => {
                        const spawned = gameStore.spawnExtraPart(kind);
                        playWoodClick();
                        gameStore.setWireHint(
                          spawned ? `Pieza agregada: ${ITEM_LABELS[kind]}` : 'Límite de piezas extra alcanzado'
                        );
                      }}
                    >
                      <span className="hud-spawner-icon" aria-hidden="true">
                        <PropSlotIcon kind={kind} />
                      </span>
                      <span className="hud-spawner-label">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menuTab === 'contracts' && (
              <div className="hud-menu-body">
                {activeContract && (
                  <div className="hud-contract-active-bar">
                    <span>
                      Encargo activo: <strong>{activeContract.title}</strong> ({contractState.elapsedSec.toFixed(1)}s)
                    </span>
                    <button
                      type="button"
                      className="hud-button"
                      onClick={() => contractStore.clearContract()}
                    >
                      Abandonar Encargo
                    </button>
                  </div>
                )}
                <div className="hud-contracts-grid">
                  {WORKSHOP_CONTRACTS.map((c) => {
                    const prog = contractState.progress[c.id];
                    const bestNuts = prog?.bestNuts ?? 0;
                    const bestTime = prog?.bestTimeSec ?? null;
                    const isActive = contractState.activeContractId === c.id;
                    return (
                      <div key={c.id} className={`hud-contract-card${isActive ? ' is-active' : ''}`}>
                        <div className="hud-contract-head">
                          <strong>{c.title}</strong>
                          <span className="hud-contract-badge">{c.badge}</span>
                        </div>
                        <p className="hud-contract-desc">{c.description}</p>
                        <div className="hud-contract-parts">Recomendado: {c.recommendedParts}</div>
                        <div className="hud-nuts-row">
                          <span aria-label={`Tuercas: ${bestNuts} de 3`}>
                            {[1, 2, 3].map((n) => (
                              <span key={n} className={n <= bestNuts ? 'hud-nut is-earned' : 'hud-nut'}>🔩</span>
                            ))}
                            {' '}Tuercas: {bestNuts}/3
                          </span>
                          {bestTime !== null && <span>Mejor: {bestTime.toFixed(1)}s</span>}
                        </div>
                        <button
                          type="button"
                          className={`hud-button${isActive ? '' : ' is-accent'}`}
                          onClick={() => {
                            playWoodClick();
                            contractStore.startContract(c.id);
                            setMenuOpen(false);
                          }}
                        >
                          {isActive ? 'Reiniciar Encargo' : 'Aceptar Encargo'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {menuTab === 'character' && (
              <div className="hud-menu-body hud-character-creator">
                <InventorAvatarPreview config={characterConfig} activeEmote={activeEmote} />

                <div className="hud-creator-section">
                  <div className="hud-menu-subtitle">Forma de Cabeza</div>
                  <div className="hud-menu-presets">
                    {HEAD_SHAPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className="hud-button"
                        aria-pressed={characterConfig.headShape === opt.id}
                        onClick={() => gameStore.setCharacterConfig({ headShape: opt.id })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="hud-creator-split">
                  <div className="hud-creator-section">
                    <div className="hud-menu-subtitle">Tono de Piel</div>
                    <div className="hud-menu-presets">
                      {SKIN_PRESETS.map((skin) => (
                        <button
                          key={skin.id}
                          type="button"
                          className="hud-button hud-swatch-btn"
                          aria-pressed={characterConfig.skinPresetId === skin.id}
                          onClick={() => gameStore.setCharacterConfig({ skinPresetId: skin.id })}
                        >
                          <span className="hud-swatch-dot" style={{ background: skin.skin }} aria-hidden="true" />
                          {skin.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="hud-creator-section">
                    <div className="hud-menu-subtitle">Color de Pelo</div>
                    <div className="hud-menu-presets">
                      {HAIR_PRESETS.map((hair) => (
                        <button
                          key={hair.id}
                          type="button"
                          className="hud-button hud-swatch-btn"
                          aria-pressed={characterConfig.hairPresetId === hair.id}
                          onClick={() => gameStore.setCharacterConfig({ hairPresetId: hair.id })}
                        >
                          <span className="hud-swatch-dot" style={{ background: hair.hair }} aria-hidden="true" />
                          {hair.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="hud-creator-section">
                  <div className="hud-menu-subtitle">Ropa de Taller</div>
                  <div className="hud-menu-presets">
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={characterConfig.outfitId === 'overol'}
                      onClick={() => gameStore.setCharacterConfig({ outfitId: 'overol' })}
                    >
                      Overol de Taller
                    </button>
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={characterConfig.outfitId === 'remera_pantalon'}
                      onClick={() => gameStore.setCharacterConfig({ outfitId: 'remera_pantalon' })}
                    >
                      Remera y Pantalón
                    </button>
                  </div>
                </div>

                <div className="hud-creator-section">
                  <div className="hud-menu-subtitle">Colores del Taller</div>
                  <div className="hud-menu-presets">
                    {WORKSHOP_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="hud-button hud-swatch-btn"
                        aria-pressed={characterConfig.colorPresetId === preset.id}
                        disabled={preset.id === 'mirador' && !towerNutFound}
                        title={preset.id === 'mirador' && !towerNutFound ? 'Encontrá la Tuerca Dorada de la Torre Mirador' : undefined}
                        onClick={() => gameStore.setCharacterConfig({ colorPresetId: preset.id })}
                      >
                        <span className="hud-swatch-dot" style={{ background: preset.swatch }} aria-hidden="true" />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {!towerNutFound && <p>Encontrá la Tuerca Dorada de la Torre Mirador para desbloquear su paleta.</p>}
                </div>

                <div className="hud-creator-section">
                  <div className="hud-menu-subtitle">Accesorios de Inventor</div>
                  <div className="hud-menu-presets">
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={characterConfig.hatStyle === 'hardhat'}
                      onClick={() =>
                        gameStore.setCharacterConfig({
                          hatStyle: characterConfig.hatStyle === 'hardhat' ? 'none' : 'hardhat',
                        })
                      }
                    >
                      Casco de Taller
                    </button>
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={characterConfig.gogglesStyle === 'forehead'}
                      onClick={() =>
                        gameStore.setCharacterConfig({
                          gogglesStyle: characterConfig.gogglesStyle === 'forehead' ? 'none' : 'forehead',
                        })
                      }
                    >
                      Antiparras
                    </button>
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={characterConfig.backpackStyle === 'scrap_pack'}
                      onClick={() =>
                        gameStore.setCharacterConfig({
                          backpackStyle: characterConfig.backpackStyle === 'scrap_pack' ? 'none' : 'scrap_pack',
                        })
                      }
                    >
                      Mochila Chatarrera
                    </button>
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={characterConfig.beltToolStyle === 'pouch'}
                      onClick={() =>
                        gameStore.setCharacterConfig({
                          beltToolStyle: characterConfig.beltToolStyle === 'pouch' ? 'none' : 'pouch',
                        })
                      }
                    >
                      Cartuchera
                    </button>
                  </div>
                </div>

                <div className="hud-creator-section">
                  <div className="hud-menu-subtitle">Probar Gestos (7 Emotes con Sonido)</div>
                  <div className="hud-emote-grid is-inline">
                    {EMOTE_CATALOG.map((emote) => (
                      <button
                        key={emote.id}
                        type="button"
                        className="hud-emote-btn"
                        aria-pressed={activeEmote === emote.id}
                        title={emote.subtitle}
                        onClick={() => {
                          gameStore.triggerEmote(emote.id);
                          playEmoteSfx(emote.id);
                        }}
                      >
                        <span className="hud-emote-icon" aria-hidden="true">{emote.icon}</span>
                        <span className="hud-emote-label">{emote.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {menuTab === 'blueprints' && (
              <div className="hud-menu-body">
                <form className="hud-menu-save" onSubmit={(event) => {
                  event.preventDefault();
                  playerInput.triggerBlueprintAction({ type: 'save', name: planName });
                  setPlanName('');
                }}>
                  <input aria-label="Nombre del plano" placeholder="Nombre de tu creación…" maxLength={40}
                    value={planName} onChange={(event) => setPlanName(event.target.value)} />
                  <button type="submit" className="hud-button is-accent" disabled={!sceneReady || seated}>Guardar invento</button>
                </form>
                <form className="hud-menu-save" onSubmit={(event) => {
                  event.preventDefault();
                  const decoded = decodeBlueprintCode(importCode);
                  if (!decoded) {
                    setShareMsg('Pegá un enlace de plano o un código que empiece con YUNKE1:');
                    return;
                  }
                  saveBlueprint(decoded);
                  gameStore.refreshBlueprints();
                  playerInput.triggerBlueprintAction({ type: 'load', blueprint: decoded });
                  setImportCode('');
                  setShareMsg(null);
                  setMenuOpen(false);
                }}>
                  <input aria-label="Importar un plano" placeholder="Pegá un enlace o código de plano"
                    value={importCode} onChange={(event) => {
                      setImportCode(event.target.value);
                      if (shareMsg) setShareMsg(null);
                    }} />
                  <button type="submit" className="hud-button is-accent" disabled={!sceneReady || seated || !importCode.trim()}>Cargar código</button>
                </form>
                {shareMsg && <div className="hud-share-msg" role="status">{shareMsg}</div>}
                {wireHint && <div className="hud-workshop-status" role="status">{wireHint}</div>}
                <div className="hud-menu-list">
                  {[...PRESET_BLUEPRINTS, ...blueprints].map((blueprint) => (
                    <div className="hud-blueprint-row" key={blueprint.id}>
                      <button type="button" className="hud-button" disabled={!sceneReady || seated} onClick={() => {
                        playerInput.triggerBlueprintAction({ type: 'load', blueprint });
                        setMenuOpen(false);
                      }}>{blueprint.name}</button>
                      <button
                        type="button"
                        className="hud-button"
                        aria-label={`Copiar link de ${blueprint.name}`}
                        onClick={() => {
                          const url = buildBlueprintShareUrl(blueprint);
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(url).then(
                              () => setShareMsg('¡Link del plano copiado!'),
                              () => setShareMsg(`Código: ${encodeBlueprintCode(blueprint)}`)
                            );
                          } else {
                            setShareMsg(`Código: ${encodeBlueprintCode(blueprint)}`);
                          }
                        }}
                      >
                        Copiar Link
                      </button>
                      {!PRESET_BLUEPRINTS.includes(blueprint) && (
                        <button type="button" className="hud-button" aria-label={`Borrar plano ${blueprint.name}`}
                          onClick={() => { deleteBlueprint(blueprint.id); gameStore.refreshBlueprints(); }}>
                          Borrar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {menuTab === 'settings' && (
              <div className="hud-menu-body">
                <div className="hud-setting-row">
                  <span>Calidad gráfica</span>
                  <div>
                    {(['low', 'medium', 'high'] as QualityLevel[]).map((level) => (
                      <button type="button" className="hud-button" key={level} aria-pressed={quality === level}
                        onClick={() => gameStore.setQuality(level)}>
                        {level === 'low' ? 'Baja' : level === 'medium' ? 'Media' : 'Alta'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="hud-setting-row">
                  <span>Cámara</span>
                  <div>
                    <button type="button" className="hud-button" onClick={() => gameStore.cycleCameraMode()}>
                      {CAMERA_VIEW_LABELS[cameraMode].label} (V)
                    </button>
                  </div>
                </div>
                <div className="hud-setting-row">
                  <span>Cámara en PC</span>
                  <div>
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={mouseLookMode === 'pointerLock'}
                      onClick={() => gameStore.setMouseLookMode('pointerLock')}
                    >
                      Ratón libre (Pointer Lock)
                    </button>
                    <button
                      type="button"
                      className="hud-button"
                      aria-pressed={mouseLookMode === 'drag'}
                      onClick={() => gameStore.setMouseLookMode('drag')}
                    >
                      Arrastrar con clic
                    </button>
                  </div>
                </div>
                <div className="hud-setting-row">
                  <span>Controles táctiles</span>
                  <div>
                    <button type="button" className="hud-button" onClick={cycleTouchMode}>
                      {touchMode === 'auto' ? 'Auto' : touchMode === 'on' ? 'Activados' : 'Desactivados'}
                    </button>
                    {!showTouch && (
                      <button type="button" className="hud-button" aria-pressed={showHelp} onClick={() => gameStore.toggleHelp()}>
                        Guía inferior
                      </button>
                    )}
                  </div>
                </div>
                <div className="hud-menu-controls">
                  <span><b>WASD</b> Mover / Conducir</span>
                  <span><b>Espacio / Shift</b> Saltar o Subir / Bajar</span>
                  <span><b>E</b> Agarrar / Montar / Subir</span>
                  <span><b>F</b> Soldar aquí / Probar o Encender</span>
                  <span><b>X / M</b> Llave / Mira láser fija</span>
                  <span><b>L / K / O</b> Cablear / Quitar / Ciclar</span>
                  <span><b>R / B / Z</b> Girar / Base / Eje</span>
                  <span><b>T / P / U</b> Soltar / Empujar / Deshacer</span>
                  <span><b>G / J / H</b> Gestos / Subir directo / Reparar</span>
                  <span><b>N / V</b> Piezas / Cámara</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showWelcome && (
        <div className="hud-menu-backdrop hud-interactive" role="dialog" aria-modal="true" aria-label="Bienvenida al taller">
          <div className="hud-menu-card wood-sign">
            <WoodBolts />
            <div className="hud-menu-header">
              <div>
                <div className="hud-menu-kicker">{GAME_SUBTITLE.toUpperCase()}</div>
                <h2>{GAME_TITLE}</h2>
              </div>
              <button type="button" className="hud-button is-accent" onClick={() => setWelcomeOpen(false)}>
                ¡A armar!
              </button>
            </div>
            <p className="hud-flow-lead">
              Elegí un modo para arrancar. Podés armar autos, barriles voladores, robots con propulsores o cualquier invento soldado libremente.
            </p>
            <div className="hud-menu-grid">
              {(['sandbox', 'delivery', 'race', 'flight'] as GameModeId[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`hud-menu-action${gameMode.mode === m ? ' is-primary' : ''}`}
                  onClick={() => {
                    contractStore.clearContract();
                    gameModeStore.setMode(m);
                    setWelcomeOpen(false);
                  }}
                >
                  <strong>{GAME_MODE_LABELS[m]}</strong>
                  <span>{MODE_DESCRIPTIONS[m]}</span>
                </button>
              ))}
            </div>
            <div className="hud-flow-steps" aria-label="Cómo jugar">
              <div className="hud-flow-step">
                <b>1. Plano o Preset</b>
                Equipá el Slot 6 para ver hologramas 3D o cargá un preset sin ruedas en Menú.
              </div>
              <div className="hud-flow-step">
                <b>2. Soldá y Cableá</b>
                Uní piezas al chasis o entre sí. Usá X/M para apuntar con el rayo láser, F para soldar/probar y L para cablear.
              </div>
              <div className="hud-flow-step">
                <b>3. Probá en Pista</b>
                Subite al asiento y salí a girar o despegar por el patio.
              </div>
            </div>
            <div className="hud-flow-footer">
              <button
                type="button"
                className="hud-button"
                onClick={openCharacterCreator}
              >
                Personalizar Inventor
              </button>
              <button
                type="button"
                className="hud-button"
                onClick={() => {
                  gameStore.selectInventory(inventorySlots.length - 1);
                  setWelcomeOpen(false);
                }}
              >
                Ver Plano Guía (Slot 6)
              </button>
              <button type="button" className="hud-button is-accent" onClick={() => setWelcomeOpen(false)}>
                Entrar al Taller
              </button>
            </div>
          </div>
        </div>
      )}

      {showContractFinish && activeContract && (
        <div className="hud-menu-backdrop hud-interactive" role="dialog" aria-modal="true" aria-label="Encargo completado">
          <div className="hud-menu-card wood-sign">
            <WoodBolts />
            <div className="hud-menu-header">
              <div>
                <div className="hud-menu-kicker">TABLÓN DE ENCARGOS</div>
                <h2>¡ENCARGO COMPLETADO!</h2>
              </div>
              <button type="button" className="hud-button" onClick={() => contractStore.clearContract()}>
                Cerrar
              </button>
            </div>
            <p className="hud-flow-lead">
              {activeContract.title} · {contractState.lastNutsEarned}/3 Tuercas{' '}
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= contractState.lastNutsEarned ? 'hud-nut is-earned' : 'hud-nut'}>🔩</span>
              ))}
            </p>
            <div className="hud-finish-stats">
              <div className="hud-finish-stat">
                <span>Tiempo</span>
                <strong>{contractState.elapsedSec.toFixed(1)}s</strong>
              </div>
              <div className="hud-finish-stat">
                <span>Piezas rotas</span>
                <strong>{contractState.brokenWeldsCount}</strong>
              </div>
            </div>
            <div className="hud-flow-footer">
              <button
                type="button"
                className="hud-button"
                onClick={() => contractStore.clearContract()}
              >
                Volver al Taller
              </button>
              <button
                type="button"
                className="hud-button"
                onClick={() => contractStore.startContract(activeContract.id)}
              >
                Repetir Encargo
              </button>
              <button
                type="button"
                className="hud-button is-accent"
                onClick={() => {
                  contractStore.clearContract();
                  setMenuTab('contracts');
                  setMenuOpen(true);
                }}
              >
                Ver Tablón
              </button>
            </div>
          </div>
        </div>
      )}

      {showFinish && (
        <div className="hud-menu-backdrop hud-interactive" role="dialog" aria-modal="true" aria-label="Desafío completado">
          <div className="hud-menu-card wood-sign">
            <WoodBolts />
            <div className="hud-menu-header">
              <div>
                <div className="hud-menu-kicker">
                  {gameMode.mode === 'race' ? 'CARRERA EN PISTA' : 'DESAFÍO DE VUELO'}
                </div>
                <h2>{gameMode.mode === 'race' ? '¡META ALCANZADA!' : '¡ARO AÉREO SUPERADO!'}</h2>
              </div>
              <button type="button" className="hud-button" onClick={() => setFinishDismissed(true)}>
                Cerrar
              </button>
            </div>
            <div className="hud-finish-stats">
              {gameMode.mode === 'race' ? (
                <>
                  <div className="hud-finish-stat">
                    <span>Tiempo de vuelta</span>
                    <strong>{gameMode.elapsedSec.toFixed(1)}s</strong>
                  </div>
                  <div className="hud-finish-stat">
                    <span>Mejor marca</span>
                    <strong>{gameMode.bestRaceSec !== null ? `${gameMode.bestRaceSec.toFixed(1)}s` : `${gameMode.elapsedSec.toFixed(1)}s`}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="hud-finish-stat">
                    <span>Altura alcanzada</span>
                    <strong>{gameMode.currentFlightMeters.toFixed(1)}m</strong>
                  </div>
                  <div className="hud-finish-stat">
                    <span>Récord de vuelo</span>
                    <strong>{gameMode.bestFlightMeters.toFixed(1)}m</strong>
                  </div>
                </>
              )}
            </div>
            <div className="hud-flow-footer">
              <button
                type="button"
                className="hud-button"
                onClick={() => {
                  setFinishDismissed(true);
                  gameModeStore.setMode('sandbox');
                }}
              >
                Mejorar en Taller
              </button>
              <button
                type="button"
                className="hud-button is-accent"
                onClick={() => {
                  setFinishDismissed(true);
                  gameModeStore.resetRun();
                }}
              >
                Reintentar Desafío
              </button>
            </div>
          </div>
        </div>
      )}

      {isDelivery && <DeliveryHud bolts={<WoodBolts />} hidden={!sceneReady || menuOpen || showWelcome} />}

      {impactFeedback && <div className="hud-impact" aria-hidden="true">{impactFeedback === 'bump' ? '¡PUM!' : '¡PLAF!'}</div>}

      {blueprintEquipped && activeGuide && (
        <aside className="hud-guide-card hud-interactive" aria-label="Plano guía equipado">
          <WoodBolts />
          <div className="hud-guide-head">
            <button type="button" className="hud-ctx-btn" aria-label="Plano anterior"
              onClick={() => gameStore.setActiveGuideIndex((activeGuideIndex - 1 + PRESET_BLUEPRINTS.length) % PRESET_BLUEPRINTS.length)}>◀</button>
            <strong>{activeGuide.name}</strong>
            <button type="button" className="hud-ctx-btn" aria-label="Plano siguiente"
              onClick={() => gameStore.setActiveGuideIndex((activeGuideIndex + 1) % PRESET_BLUEPRINTS.length)}>▶</button>
          </div>
          {activeGuide.description && <p className="hud-guide-desc">{activeGuide.description}</p>}
          {activeGuide.guideSteps && (
            <ol className="hud-guide-steps">
              {activeGuide.guideSteps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          )}
          <div className="hud-guide-actions">
            <button type="button" className="hud-ctx-btn is-accent" disabled={!sceneReady}
              onClick={() => playerInput.triggerBlueprintAction({ type: 'load', blueprint: activeGuide })}>
              Armar automático
            </button>
            <button type="button" className="hud-ctx-btn" onClick={() => gameStore.selectInventory(0)}>
              Cerrar
            </button>
          </div>
        </aside>
      )}

      <div className="hud-footer">
        {showTouch ? (
          seated ? (
            <div className="hud-drive-steer hud-interactive" role="group" aria-label="Dirección del vehículo">
              <button
                type="button"
                className="hud-steer-btn"
                aria-label="Doblar izquierda"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    // Fallback handled by pointer release listeners
                  }
                  playerInput.setTouchSteer(-1);
                }}
                onPointerUp={() => playerInput.setTouchSteer(0)}
                onPointerCancel={() => playerInput.setTouchSteer(0)}
                onLostPointerCapture={() => playerInput.setTouchSteer(0)}
              >
                ◀
              </button>
              <button
                type="button"
                className="hud-steer-btn"
                aria-label="Doblar derecha"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    // Fallback handled by pointer release listeners
                  }
                  playerInput.setTouchSteer(1);
                }}
                onPointerUp={() => playerInput.setTouchSteer(0)}
                onPointerCancel={() => playerInput.setTouchSteer(0)}
                onLostPointerCapture={() => playerInput.setTouchSteer(0)}
              >
                ▶
              </button>
            </div>
          ) : (
            <VirtualJoystick />
          )
        ) : (
          <div />
        )}
        <div className="hud-inventory hud-interactive" data-driving={seated && showTouch} aria-label="Inventario de seis espacios">
          {carriedKind && (
            <button type="button" className="hud-button hud-store" onClick={() => playerInput.triggerInventoryAction('store')}>
              Guardar{!showTouch && <kbd>I</kbd>}
            </button>
          )}
          <div className="hud-slots">
            {inventorySlots.map((item, index) => (
              <button
                key={index}
                type="button"
                className="hud-slot"
                aria-pressed={index === inventorySelection}
                aria-label={`Espacio ${index + 1}: ${item ? ITEM_LABELS[item.kind] : 'vacío'}`}
                title={item ? ITEM_LABELS[item.kind] : 'Vacío'}
                onClick={() => playerInput.triggerInventoryAction(index)}
              >
                <kbd>{index + 1}</kbd>
                {item && (
                  <>
                    <PropSlotIcon kind={item.kind} />
                    <span className="hud-slot-name">{ITEM_SHORT[item.kind]}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="hud-action-area">
          {!seated && !toolsOpen && wrenchEquipped && (carriedKind || wrenchTarget === 'piece') && (
            <div className="hud-mini-rotate hud-interactive" aria-label="Rotación rápida">
              <button type="button" className="hud-button hud-axis" title="Cambiar eje (Z)" onClick={() => gameStore.cycleWrenchAxis()}>
                {wrenchAxis}{!showTouch && <kbd>Z</kbd>}
              </button>
              <button type="button" className="hud-button" aria-label="Girar pieza a la izquierda"
                onClick={() => playerInput.triggerCartAction('rotate-back')}>↶</button>
              <button type="button" className="hud-button" aria-label="Girar pieza a la derecha"
                onClick={() => playerInput.triggerCartAction('rotate')}>↷</button>
            </div>
          )}
          {!seated && toolsOpen && hasBuildTools && (
            <div className="hud-build-panel hud-interactive" aria-label="Herramientas de armado">
              {wrenchEquipped && (carriedKind || wrenchTarget === 'piece') && (
                <div className="hud-build-row">
                  <span>Pieza</span>
                  <button type="button" className="hud-button hud-axis" title="Cambiar eje (Z)" onClick={() => gameStore.cycleWrenchAxis()}>
                    {wrenchAxis}{!showTouch && <kbd>Z</kbd>}
                  </button>
                  <button type="button" className="hud-button" aria-label="Girar pieza a la izquierda"
                    title="Girar pieza a la izquierda (Mayús + R)" onClick={() => playerInput.triggerCartAction('rotate-back')}>↶</button>
                  <button type="button" className="hud-button" aria-label="Girar pieza a la derecha"
                    title="Girar pieza a la derecha (R)" onClick={() => playerInput.triggerCartAction('rotate')}>↷</button>
                </div>
              )}
              {cartMode && (
                <div className="hud-build-row">
                  <span>Base</span>
                  <button type="button" className="hud-button" onClick={() => playerInput.triggerCartAction('toggle')}>
                    {cartMode === 'fixed' ? 'Liberar' : 'Fijar'}{!showTouch && <kbd>T</kbd>}
                  </button>
                  {cartMode === 'free' ? (
                    <button type="button" className="hud-button" onClick={() => playerInput.triggerCartAction('push')}>
                      Empujar{!showTouch && <kbd>P</kbd>}
                    </button>
                  ) : wrenchEquipped ? (
                    <>
                      <button type="button" className="hud-button" aria-label="Girar base a la izquierda"
                        title="Girar base a la izquierda (Mayús + B)" onClick={() => playerInput.triggerCartAction('rotate-base-back')}>↶</button>
                      <button type="button" className="hud-button" aria-label="Girar base a la derecha"
                        title="Girar base a la derecha (B)" onClick={() => playerInput.triggerCartAction('rotate-base')}>↷</button>
                    </>
                  ) : (
                    <button type="button" className="hud-button" onClick={() => playerInput.triggerCartAction('rotate')}>
                      Girar 45°{!showTouch && <kbd>R</kbd>}
                    </button>
                  )}
                </div>
              )}
              {cartMode === 'fixed' && (
                <div className="hud-build-row">
                  <span>Mover</span>
                  <button type="button" className="hud-button" aria-label="Mover izquierda" title="Mover izquierda (Alt + A)"
                    onClick={() => playerInput.triggerCartAction('move-left')}>◀</button>
                  <button type="button" className="hud-button" aria-label="Mover adelante" title="Mover adelante (Alt + W)"
                    onClick={() => playerInput.triggerCartAction('move-fwd')}>▲</button>
                  <button type="button" className="hud-button" aria-label="Mover atrás" title="Mover atrás (Alt + S)"
                    onClick={() => playerInput.triggerCartAction('move-back')}>▼</button>
                  <button type="button" className="hud-button" aria-label="Mover derecha" title="Mover derecha (Alt + D)"
                    onClick={() => playerInput.triggerCartAction('move-right')}>▶</button>
                  <button type="button" className="hud-button" aria-label="Subir" title="Subir (RePág / Alt + Espacio)"
                    onClick={() => playerInput.triggerCartAction('move-up')}>↥</button>
                  <button type="button" className="hud-button" aria-label="Bajar" title="Bajar (AvPág / Alt + Mayús)"
                    onClick={() => playerInput.triggerCartAction('move-down')}>↧</button>
                </div>
              )}
              {canUndoMount && (
                <div className="hud-build-row">
                  <button type="button" className="hud-button" title="Deshacer último montaje (U o Ctrl+Z)"
                    onClick={() => playerInput.triggerCartAction('undo')}>
                    Deshacer{!showTouch && <kbd>U</kbd>}
                  </button>
                </div>
              )}
            </div>
          )}

          {showTouch && (
            <div className="hud-touch-actions hud-interactive">
              {seated ? (
                <div className="hud-drive-pedals" role="group" aria-label="Pedales del vehículo">
                  <div className="hud-pedal-row">
                    {seatedFlightMode && (
                      <button
                        type="button"
                        className="hud-turbo-pill is-descend"
                        onContextMenu={(e) => e.preventDefault()}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          try {
                            event.currentTarget.setPointerCapture(event.pointerId);
                          } catch {
                            // Fallback handled by pointer release listeners
                          }
                          playerInput.setTouchDescend(true);
                        }}
                        onPointerUp={() => playerInput.setTouchDescend(false)}
                        onPointerCancel={() => playerInput.setTouchDescend(false)}
                        onLostPointerCapture={() => playerInput.setTouchDescend(false)}
                      >
                        ⬇ BAJAR
                      </button>
                    )}
                    <button
                      type="button"
                      className="hud-turbo-pill"
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          // Fallback handled by pointer release listeners
                        }
                        playerInput.setTouchJump(true);
                      }}
                      onPointerUp={() => playerInput.setTouchJump(false)}
                      onPointerCancel={() => playerInput.setTouchJump(false)}
                      onLostPointerCapture={() => playerInput.setTouchJump(false)}
                    >
                      {seatedFlightMode ? '🚀 SUBIR / TURBO' : '🔥 TURBO'}
                    </button>
                  </div>
                  <div className="hud-pedal-row">
                    <button
                      type="button"
                      className="hud-pedal-btn hud-pedal-brake"
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          // Fallback handled by pointer release listeners
                        }
                        playerInput.setTouchThrottle(-1);
                      }}
                      onPointerUp={() => playerInput.setTouchThrottle(0)}
                      onPointerCancel={() => playerInput.setTouchThrottle(0)}
                      onLostPointerCapture={() => playerInput.setTouchThrottle(0)}
                    >
                      <span>▼</span>
                      <small>FRENO / REV</small>
                    </button>
                    <button
                      type="button"
                      className="hud-pedal-btn hud-pedal-gas"
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          // Fallback handled by pointer release listeners
                        }
                        playerInput.setTouchThrottle(1);
                      }}
                      onPointerUp={() => playerInput.setTouchThrottle(0)}
                      onPointerCancel={() => playerInput.setTouchThrottle(0)}
                      onLostPointerCapture={() => playerInput.setTouchThrottle(0)}
                    >
                      <span>▲</span>
                      <small>ACELERAR</small>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {wrenchEquipped && (
                    <div className="hud-wrench-actions">
                      <button type="button" className="hud-button" aria-pressed={wrenchAiming}
                        onClick={() => gameStore.setWrenchAiming(!wrenchAiming)}>Mira</button>
                      {wrenchAiming && <button type="button" className="hud-button" onClick={() => playerInput.requestWire()}>Cable</button>}
                    </div>
                  )}
                  <button type="button" className="hud-pad hud-pad-run" data-active={touchRunActive}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setTouchRunActive(true);
                      playerInput.setTouchRun(true);
                    }}
                    onPointerUp={() => { setTouchRunActive(false); playerInput.setTouchRun(false); }}
                    onPointerCancel={() => { setTouchRunActive(false); playerInput.setTouchRun(false); }}
                    onLostPointerCapture={() => { setTouchRunActive(false); playerInput.setTouchRun(false); }}>
                    Correr
                  </button>
                  <button type="button" className="hud-pad hud-pad-interact" data-active={canInteract}
                    onPointerDown={(event) => { event.stopPropagation(); playerInput.triggerInteract(); }}
                    onClick={(event) => { if (event.detail === 0) playerInput.triggerInteract(); }}>
                    {interactLabel}
                  </button>
                  <button type="button" className="hud-pad hud-pad-jump"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      playerInput.setTouchJump(true);
                    }}
                    onPointerUp={() => playerInput.setTouchJump(false)}
                    onPointerCancel={() => playerInput.setTouchJump(false)}
                    onLostPointerCapture={() => playerInput.setTouchJump(false)}>
                    Saltar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showHelp && !showTouch && (
        <div className="hud-guide">
          <span><kbd>WASD</kbd> {seated ? (seatedFlightMode ? 'Volar' : 'Conducir') : 'Mover'}</span>
          <span><kbd>Espacio</kbd> {seated ? (seatedFlightMode ? 'Subir' : 'Turbo') : 'Saltar'}</span>
          {seated && seatedFlightMode && <span><kbd>Shift</kbd> Bajar</span>}
          <span><kbd>E</kbd> {seated ? 'Bajar' : 'Interactuar'}</span>
          <span><kbd>X / M</kbd> Llave / Mira</span>
          <span><kbd>F</kbd> Soldar / Probar</span>
          <span><kbd>G</kbd> Gestos</span>
          <span><kbd>P</kbd> Empujar</span>
          <span><kbd>N</kbd> Piezas</span>
          {mouseLookMode === 'pointerLock' && !pointerLocked && <span>Clic en escena: Ratón libre · Esc: cursor</span>}
          {(wrenchEquipped || wrenchAimLocked) && <span><kbd>Clic</kbd> Apuntar/Usar · <kbd>R / Z</kbd> Girar · <kbd>L / K</kbd> Cable</span>}
        </div>
      )}
    </div>
  );
}
