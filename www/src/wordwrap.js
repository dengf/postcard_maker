import { containsCjk } from './fonts';

/**
 * Wraps `text` to fit within `maxWidth` on a canvas 2D context that
 * already has its `font` set. CJK text wraps by character -- there are no
 * spaces between words to break on, and breaking mid-word for Latin text
 * (or mid-character for CJK, which can't happen) would look broken rather
 * than considered. An explicit newline in the message always starts a new
 * line, on top of any wrapping within it.
 */
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    const units = containsCjk(paragraph) ? [...paragraph] : paragraph.split(' ');
    const glue = containsCjk(paragraph) ? '' : ' ';
    let current = '';
    for (const unit of units) {
      const candidate = current ? current + glue + unit : unit;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = unit;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
