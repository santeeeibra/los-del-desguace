import type { InventoryKind } from '../state/inventory';

/**
 * Íconos SVG estilizados (contorno oscuro + paleta del taller) para los slots del inventario.
 */
export function PropSlotIcon({ kind }: { kind: InventoryKind }) {
  const stroke = '#161b19';
  switch (kind) {
    case 'wheel':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="12" fill="#2b2f36" stroke={stroke} strokeWidth="2.4" />
          <circle cx="16" cy="16" r="6.5" fill="#e2a82e" stroke={stroke} strokeWidth="2" />
          <circle cx="16" cy="16" r="2.5" fill="#a7adb3" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case 'part':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="10" width="20" height="14" rx="3" fill="#3b4048" stroke={stroke} strokeWidth="2.2" />
          <path d="M8 10l3-4h10l3 4" fill="#3e8c84" stroke={stroke} strokeWidth="2" />
          <circle cx="16" cy="7" r="3" fill="#c84b36" stroke={stroke} strokeWidth="1.8" />
          <circle cx="12" cy="17" r="2.6" fill="#a7adb3" stroke={stroke} strokeWidth="1.6" />
          <circle cx="20" cy="17" r="2.2" fill="#d49d3b" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case 'battery':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="9" width="20" height="16" rx="3" fill="#c84b36" stroke={stroke} strokeWidth="2.2" />
          <rect x="5" y="8" width="22" height="5" rx="2" fill="#3b4048" stroke={stroke} strokeWidth="2" />
          <rect x="9" y="4.5" width="4" height="4" rx="1" fill="#d49d3b" stroke={stroke} strokeWidth="1.6" />
          <rect x="19" y="4.5" width="4" height="4" rx="1" fill="#a7adb3" stroke={stroke} strokeWidth="1.6" />
          <path d="M17 14l-3 5h3l-1.5 4 4-5h-3z" fill="#ffe066" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case 'wing':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M4 20L15 8l13 2-9 12z" fill="#3e8c84" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M4 20l4-4 15-4-4 6z" fill="#e2a82e" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'thruster':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M11 22h10l2 5H9z" fill="#4c525c" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <rect x="10" y="6" width="12" height="16" rx="5" fill="#c84b36" stroke={stroke} strokeWidth="2.2" />
          <rect x="10" y="13" width="12" height="4" fill="#e2a82e" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'headlight':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="15" r="9.5" fill="#e2a82e" stroke={stroke} strokeWidth="2.2" />
          <circle cx="16" cy="15" r="6" fill="#fff0b8" stroke={stroke} strokeWidth="1.8" />
          <path d="M10 25h12" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'seat':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M9 6h10l2 12H9z" fill="#c84b36" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="8" y="18" width="16" height="6" rx="2.5" fill="#c84b36" stroke={stroke} strokeWidth="2.2" />
          <path d="M9 26h14" stroke="#a7adb3" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case 'canister':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="9" y="6" width="14" height="20" rx="4" fill="#8f4a2a" stroke={stroke} strokeWidth="2.2" />
          <rect x="9" y="13" width="14" height="5" fill="#e2a82e" stroke={stroke} strokeWidth="1.5" />
          <rect x="17" y="4" width="4" height="3" rx="1" fill="#d49d3b" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case 'woodBarrel':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <ellipse cx="16" cy="16" rx="9" ry="11" fill="#b97e48" stroke={stroke} strokeWidth="2.2" />
          <path d="M8 12h16M8 20h16" stroke="#2d3138" strokeWidth="2.6" />
        </svg>
      );
    case 'timerBox':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="8" width="20" height="18" rx="3" fill="#3b4048" stroke={stroke} strokeWidth="2.2" />
          <circle cx="16" cy="17" r="6" fill="#e2a82e" stroke={stroke} strokeWidth="1.8" />
          <path d="M16 14v3l2.5 1.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'switchBox':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="10" width="20" height="16" rx="3" fill="#3b4048" stroke={stroke} strokeWidth="2.2" />
          <path d="M16 16l5-9" stroke="#c84b36" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="21" cy="7" r="2.5" fill="#ffe066" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case 'logicAnd':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="8" width="20" height="18" rx="3" fill="#3e8c84" stroke={stroke} strokeWidth="2.2" />
          <path d="M12 13h5a4 4 0 0 1 0 8h-5z" fill="#fbedd1" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case 'magnet':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M9 8v9a7 7 0 0 0 14 0V8h-4v9a3 3 0 0 1-6 0V8z" fill="#c84b36" stroke={stroke} strokeWidth="2.2" />
          <rect x="9" y="8" width="4" height="4" fill="#a7adb3" stroke={stroke} strokeWidth="1.4" />
          <rect x="19" y="8" width="4" height="4" fill="#a7adb3" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case 'spring':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="4.5" width="20" height="4.5" rx="2" fill="#e2a82e" stroke={stroke} strokeWidth="2" />
          <path
            d="M10 9l12 3.5-12 3.5 12 3.5-12 3.5"
            fill="none"
            stroke="#c84b36"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 9l12 3.5-12 3.5 12 3.5-12 3.5"
            fill="none"
            stroke={stroke}
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="6" y="23" width="20" height="4.5" rx="2" fill="#5c646d" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'balloon':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 21c-1 2.6 2 3.6 0 7" fill="none" stroke="#fbedd1" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="16" cy="12.5" rx="9" ry="10" fill="#d94632" stroke={stroke} strokeWidth="2.2" />
          <path d="M16 2.5c3.2 0 5.5 4.2 5.5 10s-2.3 10-5.5 10" fill="none" stroke="#f5b83d" strokeWidth="2.4" />
          <ellipse cx="12.5" cy="9" rx="2.2" ry="3.4" transform="rotate(-18 12.5 9)" fill="#ffd89c" opacity="0.8" />
          <polygon points="14,22 18,22 17,24.5 15,24.5" fill="#d94632" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'boxingGlove':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M6 17h12v9H6z" fill="#555e65" stroke={stroke} strokeWidth="2" />
          <path d="M13 19v-7a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v4a7 7 0 0 1-7 7h-6z" fill="#d94732" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'flag':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M8 6h17l-3 6 3 6H8z" fill="#d94732" stroke={stroke} strokeWidth="2" />
          <path d="M8 5v23" stroke="#e2a82e" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case 'droneRotor':
    case 'fan':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="12" fill="#3b4048" stroke={stroke} strokeWidth="2.2" />
          <circle cx="16" cy="16" r="9.2" fill="#253438" stroke={stroke} strokeWidth="1.6" />
          <path
            d="M16 16 C12 9 19 6.5 20 11.5 C21 15 17.5 16 16 16 Z"
            fill="#66d4c4"
            stroke={stroke}
            strokeWidth="1.5"
          />
          <path
            d="M16 16 C23 14 24.5 21 19.5 21.5 C16.5 21.8 16 17.5 16 16 Z"
            fill="#e2a82e"
            stroke={stroke}
            strokeWidth="1.5"
          />
          <path
            d="M16 16 C14 23 7.5 20.5 10.5 16 C12 13.5 14.5 15.2 16 16 Z"
            fill="#66d4c4"
            stroke={stroke}
            strokeWidth="1.5"
          />
          <circle cx="16" cy="16" r="3.2" fill="#f5b83d" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case 'horn':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="8" cy="18" r="4.5" fill="#c84b36" stroke={stroke} strokeWidth="2" />
          <path
            d="M11 16 L23 8.5 L25 22.5 L11 19.5 Z"
            fill="#e2a82e"
            stroke={stroke}
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <ellipse cx="24" cy="15.5" rx="2.5" ry="7" fill="#fff0b8" stroke={stroke} strokeWidth="1.8" />
          <path d="M27.5 12c1.5 1.5 1.5 5.5 0 7" fill="none" stroke="#ffe066" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'gyro':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="7" y="24" width="18" height="4" rx="1.5" fill="#4c525c" stroke={stroke} strokeWidth="1.8" />
          <circle cx="16" cy="15" r="9.5" fill="none" stroke="#e2a82e" strokeWidth="3.2" />
          <circle cx="16" cy="15" r="9.5" fill="none" stroke={stroke} strokeWidth="1.1" />
          <ellipse cx="16" cy="15" rx="9" ry="4.2" transform="rotate(-32 16 15)" fill="none" stroke="#3e8c84" strokeWidth="2.8" />
          <circle cx="16" cy="15" r="3.6" fill="#ffe066" stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case 'blueprint':
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="5" width="20" height="22" rx="3" fill="#2d6488" stroke={stroke} strokeWidth="2.2" />
          <path d="M10 11h12M10 16h8M10 21h10" stroke="#aee8ff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="22" cy="21" r="2.5" fill="#ffe066" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case 'crate':
    default:
      return (
        <svg className="hud-slot-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="6" y="6" width="20" height="20" rx="3" fill="#c48a55" stroke={stroke} strokeWidth="2.2" />
          <path d="M8 8l16 16M24 8L8 24" stroke="#8f5b32" strokeWidth="2.2" />
          <rect x="6" y="6" width="20" height="20" rx="3" fill="none" stroke={stroke} strokeWidth="2.2" />
        </svg>
      );
  }
}
