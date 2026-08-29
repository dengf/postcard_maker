import React from 'react';

/**
 * Small inline outline icons. Hand-drawn SVG, not an icon-font/library
 * dependency -- same minimal-dependency stance as `MeifioMark.jsx`.
 * Decorative only: the label text next to each one already carries the
 * accessible name, so these are `aria-hidden`.
 */
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'field-icon',
  'aria-hidden': true,
};

export function CameraIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

export function ImageIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17 L9.5 12 L13 15 L16.5 11.5 L20 15" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="M8.2 10.8 L15.8 7.2 M8.2 13.2 L15.8 16.8" />
    </svg>
  );
}

export function SaveIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 4 V15 M7 10.5 L12 15.5 L17 10.5" />
      <path d="M4.5 18.5 H19.5" />
    </svg>
  );
}

/** Used by CollapsiblePanel -- rotated 180deg via CSS when its section is open. */
export function ChevronIcon({ className }) {
  return (
    <svg {...ICON_PROPS} className={className ? `${ICON_PROPS.className} ${className}` : ICON_PROPS.className}>
      <path d="M6 9 L12 15 L18 9" />
    </svg>
  );
}

export function FontGlyphIcon() {
  return (
    <svg {...ICON_PROPS}>
      <text x="2.5" y="17.5" fontSize="13" fontWeight="700" fill="currentColor" stroke="none" fontFamily="serif">
        Aa
      </text>
    </svg>
  );
}

export function SizeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <text x="2" y="18" fontSize="16" fontWeight="700" fill="currentColor" stroke="none">
        A
      </text>
      <text x="15" y="18" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">
        A
      </text>
    </svg>
  );
}

export function AlignGlyphIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 6 H20 M4 11 H14 M4 16 H17" />
    </svg>
  );
}

export function ColorSwatchGlyphIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="7.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
