import React, { useState } from 'react';
import { useIsNarrow } from '../useIsNarrow';
import { ChevronIcon } from './icons';

/**
 * A `.panel` that starts collapsed on phones -- saving scroll real
 * estate across a long single-column stack of control panels -- and
 * stays open by default on desktop, where the sticky preview column
 * already leaves plenty of room (see CLAUDE.md's phone-first rules).
 * Each instance opens/closes independently; there's no accordion
 * coupling between panels using this.
 */
export default function CollapsiblePanel({ title, children }) {
  const narrow = useIsNarrow();
  const [open, setOpen] = useState(!narrow);

  return (
    <div className="panel collapsible-panel">
      <button
        type="button"
        className="collapsible-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <h2>{title}</h2>
        <ChevronIcon className={open ? 'chevron-icon open' : 'chevron-icon'} />
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
