export type ToolIconKind = 'wrench' | 'welder' | 'grinder' | 'slice' | 'sawTable' | 'saw' | 'wire' | 'spray';

/**
 * Miniaturas SVG de las herramientas (contorno oscuro + paleta del taller), mismo estilo que los
 * íconos del inventario. Se usan en los botones de herramientas y en la barra de rebanar.
 */
export function ToolIcon({ tool, className = 'hud-tool-icon' }: { tool: ToolIconKind; className?: string }) {
  const stroke = '#161b19';
  switch (tool) {
    case 'wrench':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <path d="M9 25L20 14" stroke={stroke} strokeWidth="7" strokeLinecap="round" />
          <path d="M9 25L20 14" stroke="#3c8a7d" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M19 6.5a5.5 5.5 0 0 0-1.5 8.2 5.5 5.5 0 0 0 8.2-1.5l-3.2 1.2-2.5-2.5 1.2-3.2z"
            fill="#a7adb3" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 'welder':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <rect x="4" y="13" width="14" height="9" rx="2.5" fill="#c84b36" stroke={stroke} strokeWidth="2.2" />
          <rect x="9" y="21" width="5" height="8" rx="1.5" fill="#4a2a12" stroke={stroke} strokeWidth="2" />
          <path d="M18 17h6" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          <path d="M18 17h6" stroke="#a7adb3" strokeWidth="2" strokeLinecap="round" />
          <path d="M26 11l1.2 3.2 3.3.4-2.6 2 .9 3.3-2.8-1.9-2.9 1.7 1-3.3-2.4-2.2 3.3-.2z"
            fill="#ffe066" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case 'grinder':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="21" cy="19" r="9" fill="#e8edf0" stroke={stroke} strokeWidth="2.2" />
          <circle cx="21" cy="19" r="2.6" fill="#d49d3b" stroke={stroke} strokeWidth="1.6" />
          <path d="M12.5 15.5L5 9l-1.5 2.5 6 7z" fill="#c84b36" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <rect x="3" y="6" width="7" height="4.5" rx="2" fill="#2b2f36" stroke={stroke} strokeWidth="1.8"
            transform="rotate(35 6.5 8)" />
          <path d="M28 8l1.6-1.6M30 13h2M26 3.5v2" stroke="#ffb02e" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'slice':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <rect x="3" y="9" width="11" height="15" rx="2.5" fill="#b9783c" stroke={stroke} strokeWidth="2.2" />
          <rect x="18" y="12" width="11" height="15" rx="2.5" fill="#b9783c" stroke={stroke} strokeWidth="2.2"
            transform="rotate(7 23.5 19.5)" />
          <path d="M16 3v26" stroke="#52e0f0" strokeWidth="3" strokeLinecap="round" />
          <path d="M16 3v26" stroke="#e8fcff" strokeWidth="1" strokeLinecap="round" />
          <path d="M26 4l1 2.4 2.4 1-2.4 1L26 11l-1-2.6-2.4-1 2.4-1z" fill="#ffe066" stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
        </svg>
      );
    case 'saw':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <rect x="4" y="15" width="13" height="9" rx="2.5" fill="#c84b36" stroke={stroke} strokeWidth="2.2" />
          <rect x="7" y="23" width="5" height="7" rx="1.5" fill="#4a2a12" stroke={stroke} strokeWidth="2" />
          <circle cx="21" cy="16" r="8.5" fill="#e8edf0" stroke={stroke} strokeWidth="2.2" />
          <circle cx="21" cy="16" r="2.4" fill="#d49d3b" stroke={stroke} strokeWidth="1.6" />
          <path d="M21 7.5v3M21 21.5v3M12.5 16h3M26.5 16h3" stroke="#6b7176" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M21 25v6" stroke="#52e0f0" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'wire':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <rect x="4" y="13" width="14" height="9" rx="2.5" fill="#2c7e73" stroke={stroke} strokeWidth="2.2" />
          <rect x="8" y="21" width="5" height="8" rx="1.5" fill="#4a2a12" stroke={stroke} strokeWidth="2" />
          <circle cx="11" cy="10" r="4.2" fill="#d97a38" stroke={stroke} strokeWidth="2" />
          <path d="M18 15l8-3M18 19l8 3" stroke="#e3b34c" strokeWidth="3" strokeLinecap="round" />
          <circle cx="27" cy="12" r="2.2" fill="#72f5da" stroke={stroke} strokeWidth="1.2" />
          <circle cx="27" cy="22" r="2.2" fill="#72f5da" stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
    case 'spray':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <rect x="9" y="11" width="12" height="18" rx="3" fill="#c84b36" stroke={stroke} strokeWidth="2.2" />
          <path d="M9 17h12" stroke="#ffe066" strokeWidth="2.4" />
          <path d="M11 11c0-3 2-4.5 4-4.5s4 1.5 4 4.5" fill="#a7adb3" stroke={stroke} strokeWidth="2" />
          <rect x="13" y="3" width="4" height="4" rx="1" fill="#2b2f36" stroke={stroke} strokeWidth="1.6" />
          <circle cx="23" cy="4.5" r="1.3" fill="#5fb4d8" />
          <circle cx="26.5" cy="7" r="1.6" fill="#f2c12e" />
          <circle cx="24" cy="9.5" r="1.1" fill="#4b5d32" />
        </svg>
      );
    case 'sawTable':
      return (
        <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
          <rect x="3" y="21" width="26" height="5" rx="1.8" fill="#b9783c" stroke={stroke} strokeWidth="2.2" />
          <path d="M7 26v4M25 26v4" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="16" cy="13" r="8.5" fill="#e8edf0" stroke={stroke} strokeWidth="2.2" />
          <circle cx="16" cy="13" r="2.4" fill="#d49d3b" stroke={stroke} strokeWidth="1.6" />
          <path d="M16 4.5v3M16 18.5v3M7.5 13h3M21.5 13h3" stroke="#6b7176" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}
