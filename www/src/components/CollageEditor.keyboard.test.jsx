import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import CollageEditor from './CollageEditor';

// The collage was operable by touch and by mouse and by nothing else: a
// slot was a plain div with an onClick, so there was no way to reach one
// from a keyboard, and therefore no way to point FilterPanel at any photo
// but the one a pointer had last selected. The source cannot show that
// this is fixed -- `tabIndex` in a diff proves a tab stop exists, not that
// the arrows move it or that the right slot ends up selected -- so this
// renders the editor and presses the keys, the same exception
// `ConfirmDialog.test.jsx` makes for the same reason.

// One tall slot down the left, two stacked on the right. Generated
// layouts are the reason arrowing by index would be wrong: slot 2 is
// below slot 1 here and could be beside it in the next deal.
const THREE_UP = {
  id: 'three-up',
  slots: [
    { area: { x: 0, y: 0, w: 0.5, h: 1 } },
    { area: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
    { area: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } },
  ],
};

const AREA = { x: 0, y: 0, w: 1, h: 1 };

// Three browser APIs jsdom does not implement, none of them the slots'
// own: `matchMedia` is asked for by the panels below the card
// (`useIsNarrow`), `ResizeObserver` and a 2D context by the doodle canvas
// over it. Desktop is the honest answer for a keyboard test, and a canvas
// nothing draws on here needs only to answer without throwing. Stubbed in
// this file rather than in `src/test/setup.js`, which is one line and
// shared by suites that render nothing.
beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

function fakeWasm() {
  return {
    collage_shuffle: vi.fn(() => [THREE_UP]),
    collage_layout: vi.fn(() => THREE_UP),
    template_geometry: vi.fn(() => ({
      photoArea: AREA,
      blankArea: { x: 0, y: 0, w: 0, h: 0 },
      stampBox: { x: 0.82, y: 0.04, w: 0.14, h: 0.12 },
      messageArea: { x: 0.08, y: 0.72, w: 0.84, h: 0.2 },
    })),
    suggest_crop_ratio: vi.fn((w, h) => ({ x: 0, y: 0, w, h })),
  };
}

function open() {
  render(
    <I18nProvider initialLocale="en">
      <CollageEditor wasmModule={fakeWasm()} onError={vi.fn()} onExit={vi.fn()} onBack={vi.fn()} />
    </I18nProvider>,
  );
  return screen.getAllByRole('button', { name: /slot \d of 3/i });
}

describe('the collage slots answer to a keyboard', () => {
  it('spends one tab stop on the whole card, on the selected slot', async () => {
    const user = userEvent.setup();
    const slots = open();
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.tabIndex)).toEqual([0, -1, -1]);

    await user.tab();
    expect(slots[0]).toHaveFocus();
    // Out the other side, not on to slot 1: a four-photo collage that
    // spent four tab stops here would push every panel below it further
    // away for exactly the people who need it closest.
    await user.tab();
    expect(slots[1]).not.toHaveFocus();
    expect(slots[2]).not.toHaveFocus();
  });

  it('moves between slots by where they are, not by index', async () => {
    const user = userEvent.setup();
    const slots = open();
    await user.tab();

    await user.keyboard('{ArrowRight}');
    expect(slots[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(slots[2]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(slots[0]).toHaveFocus();
    // Nothing is below the tall left-hand slot, so nothing happens --
    // rather than a jump to the far corner.
    await user.keyboard('{ArrowDown}');
    expect(slots[0]).toHaveFocus();
  });

  it('carries the selection along with the focus', async () => {
    const user = userEvent.setup();
    const slots = open();
    await user.tab();
    await user.keyboard('{ArrowRight}');

    // Which is what points the panels at that slot: `aria-current` is the
    // same flag `.active` paints the ring with.
    expect(slots[1]).toHaveAttribute('aria-current', 'true');
    expect(slots[0]).not.toHaveAttribute('aria-current');
    // And the tab stop moves with it, so leaving and coming back returns
    // to the slot being worked on.
    expect(slots.map((s) => s.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('opens the picker for the slot the keys are on', async () => {
    const user = userEvent.setup();
    const slots = open();
    const clicked = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    await user.tab();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(clicked).toHaveBeenCalledTimes(1);
    // Space too -- and without scrolling the card away underneath it.
    await user.keyboard(' ');
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(slots[1]).toHaveFocus();
    clicked.mockRestore();
  });

  // The empty slot used to be a `<label>` around its own file input, and
  // that input is gone now -- the slot itself opens the shared picker.
  // Same tap, same target, so this is the regression that change could
  // have caused.
  it('still opens the picker when an empty slot is tapped', async () => {
    const user = userEvent.setup();
    const slots = open();
    const clicked = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    await user.click(slots[2]);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(slots[2]).toHaveAttribute('aria-current', 'true');
    clicked.mockRestore();
  });

  it('tells the reader what the keys do', async () => {
    const user = userEvent.setup();
    const slots = open();
    await user.tab();
    const hint = document.getElementById(slots[0].getAttribute('aria-describedby'));
    expect(hint).toHaveTextContent(/arrow keys/i);
    expect(hint).toHaveTextContent(/shift/i);
  });
});
