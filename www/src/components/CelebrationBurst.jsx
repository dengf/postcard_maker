import React, { useEffect, useState } from 'react';
import { stickerById } from '../stickers';
import StickerIcon from './StickerIcon';

const BLOSSOM = stickerById('blossom');
// Five petals for the burst too, matching the mark's own five-fold
// geometry -- see CLAUDE.md's rule that this brand's blossom is never
// drawn with six.
const ANGLES = [0, 72, 144, 216, 288];

/**
 * A brief five-petal blossom burst on a successful Share/Save -- pure
 * CSS/SVG, no new dependency or asset. `trigger` is a value that changes
 * (e.g. an incrementing counter) each time the celebration should replay.
 */
export default function CelebrationBurst({ trigger }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === 0 || trigger == null) return;
    setVisible(true);
    const handle = setTimeout(() => setVisible(false), 1400);
    return () => clearTimeout(handle);
  }, [trigger]);

  if (!visible) return null;

  return (
    <div className="celebration-burst" aria-hidden="true">
      {ANGLES.map((angle) => (
        <span key={angle} className="celebration-petal" style={{ '--angle': `${angle}deg` }}>
          <StickerIcon sticker={BLOSSOM} />
        </span>
      ))}
    </div>
  );
}
