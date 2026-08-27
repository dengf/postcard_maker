/**
 * A cheap CSS `filter` approximation of `postcard-calc`'s Rust filters,
 * for the live editor preview only. Interactive, so it has to redraw on
 * every slider tick without touching wasm -- see CLAUDE.md. The *actual*
 * pixels only ever come from `postcard-calc::filters`, at export; this is
 * deliberately just a close-enough look while dragging, not a second
 * implementation of the filter math with a claim to being correct.
 */
const NAMED_FILTER_CSS = {
  none: '',
  grayscale: 'grayscale(1)',
  sepia: 'sepia(0.8)',
  vintage: 'sepia(0.35) contrast(0.92) brightness(0.97) saturate(0.75)',
};

export function previewFilterCss(adjustments, filter) {
  const base = `brightness(${1 + adjustments.brightness}) contrast(${adjustments.contrast}) saturate(${adjustments.saturation})`;
  const named = NAMED_FILTER_CSS[filter] ?? '';
  return named ? `${base} ${named}` : base;
}
