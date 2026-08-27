/**
 * The greeting-message text tool offers a decorative Latin display font
 * alongside the plain system-font stack. A decorative font has no CJK
 * glyphs, so typing Chinese into a message set to it would silently mix
 * two typefaces mid-word -- Latin letters in the decorative face, Chinese
 * characters falling back to whatever system font the browser picks. That
 * mismatch is worse than just not offering the choice, so the decorative
 * option turns itself off the moment the message contains CJK text rather
 * than let it happen. See CLAUDE.md for the full rationale.
 */
const CJK_PATTERN = /[㐀-鿿豈-﫿＀-￯]/;

export function containsCjk(text) {
  return CJK_PATTERN.test(text ?? '');
}

export const FONT_STACKS = {
  system: '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
  decorative: '"Brush Script MT", "Segoe Script", cursive',
};

/** The font choice actually in effect, forcing `system` once CJK appears. */
export function effectiveFont(choice, message) {
  return choice === 'decorative' && containsCjk(message) ? 'system' : choice;
}
