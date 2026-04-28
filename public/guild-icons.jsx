/* ===== GUILD ICONS — Inline SVG library for Guild × Command Deck theme =====
   Exposes window.GuildIcons.{Sigil, Scroll, Banner, WaxSeal, CrossedSwords}.
   All icons:
   - Take props {size?: number, color?: string, className?: string}
   - Default size 20, default color uses currentColor (so CSS controls hue)
   - Inherit stroke from `currentColor` so they pick up parent text color
   ============================================================================ */

const Sigil = ({ size = 20, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ color: color || 'currentColor' }}
  >
    <path
      d="M12 2 L22 8 L19 21 L5 21 L2 8 Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M12 12 L12 5 M12 12 L18 9 M12 12 L17 18 M12 12 L7 18 M12 12 L6 9"
      stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
  </svg>
);

const Scroll = ({ size = 20, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ color: color || 'currentColor' }}
  >
    <path d="M5 4 H19 V20 H5 Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    {/* Top + bottom scroll rolls */}
    <path d="M3 4 Q5 4 5 6 Q5 4 7 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M17 4 Q19 4 19 6 Q19 4 21 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M3 20 Q5 20 5 18" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M17 20 Q19 20 19 18" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    {/* Quest lines */}
    <line x1="8" y1="9"  x2="16" y2="9"  stroke="currentColor" strokeWidth="0.8" opacity="0.6"/>
    <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="0.8" opacity="0.6"/>
    <line x1="8" y1="15" x2="13" y2="15" stroke="currentColor" strokeWidth="0.8" opacity="0.6"/>
  </svg>
);

const Banner = ({ size = 20, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ color: color || 'currentColor' }}
  >
    {/* Pole */}
    <line x1="6" y1="3" x2="6" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    {/* Flag with notched tail */}
    <path d="M6 4 L20 4 L17 9 L20 14 L6 14 Z"
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
    {/* Star on flag */}
    <path d="M13 7 L14 9 L16 9 L14.5 10 L15 12 L13 11 L11 12 L11.5 10 L10 9 L12 9 Z"
      fill="currentColor" opacity="0.7"/>
  </svg>
);

const WaxSeal = ({ size = 20, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ color: color || 'currentColor' }}
  >
    {/* Outer wax */}
    <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.85"/>
    {/* Inner star/sigil stamped */}
    <path
      d="M12 6 L13.5 10.5 L18 11 L14.5 14 L15.5 18.5 L12 16 L8.5 18.5 L9.5 14 L6 11 L10.5 10.5 Z"
      fill="#fff"
      opacity="0.25"
      stroke="#fff"
      strokeWidth="0.6"
    />
    {/* Dripping edges */}
    <path d="M5 14 Q4 17 6 18 M19 14 Q20 17 18 18 M12 21 Q12 22 13 22.5"
      stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6"/>
  </svg>
);

const CrossedSwords = ({ size = 20, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ color: color || 'currentColor' }}
  >
    {/* Left blade */}
    <path d="M3 21 L7 17 L17 7 L19 5 L20 6 L18 8 L8 18 L4 22 Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
    {/* Right blade */}
    <path d="M21 21 L17 17 L7 7 L5 5 L4 6 L6 8 L16 18 L20 22 Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
    {/* Hilts (handles) */}
    <line x1="3" y1="21" x2="6" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <line x1="21" y1="21" x2="18" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    {/* Cross-guards */}
    <line x1="16" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="4" y1="6" x2="8" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

window.GuildIcons = { Sigil, Scroll, Banner, WaxSeal, CrossedSwords };
