/**
 * The recipient address is free text, one line of input per ruled line
 * (name / street / city-state-zip) -- see `BackSidePanel.jsx`. Both the
 * back side (`export.js`'s `renderBackSide`) and the front's split-layout
 * "To" block (`PostcardOverlay.jsx`'s live preview, `export.js`'s
 * `renderPostcard`) parse it the same way, so this is the one place that
 * split/trim/cap logic lives rather than three slightly-different copies.
 */

export const ADDRESS_LINE_COUNT = 4;

/** Up to `ADDRESS_LINE_COUNT` non-empty, trimmed lines from raw address text. */
export function parseAddressLines(address) {
  return (address ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, ADDRESS_LINE_COUNT);
}
