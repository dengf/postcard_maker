import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The photo's own date is the one "Suggest a look" signal that costs no
// download -- it reads EXIF through the *main* wasm bundle, which is the
// entire reason `postcard_calc::moment` lives there and not in
// `postcard-wasm-vibe`. For a while its only caller was inside
// `VibePanel`'s `runSuggest`, so the free suggestion was reachable only
// by tapping "Suggest a look" and, on the happy path, only after the
// ~13MB download it exists to avoid.
//
// A source-text guard, same spirit as `collage-slot-refill.test.js` and
// `wasm-call-sites.test.js`: nothing in this suite renders components,
// and the regression this protects against is the suggestion quietly
// going back behind that download -- which no reducer test can see.

const SRC = import.meta.dirname;
const read = (...parts) => fs.readFileSync(path.join(SRC, ...parts), 'utf8');

const app = read('App.jsx');
const collage = read('components', 'CollageEditor.jsx');
const textPanel = read('components', 'TextPanel.jsx');
const hook = read('useMomentCaption.js');
const vibePanel = read('components', 'VibePanel.jsx');

describe('the date greeting is reachable without downloading a model', () => {
  it('both editors read it and hand it to the message panel', () => {
    for (const [name, src] of [
      ['App.jsx', app],
      ['CollageEditor.jsx', collage],
    ]) {
      expect(src, `${name} should call useMomentCaption`).toMatch(/useMomentCaption\(/);
      expect(src, `${name} should pass it to TextPanel`).toMatch(/suggestion=\{momentCaption\}/);
    }
  });

  it('the message panel offers it, and only while the message is empty', () => {
    expect(textPanel).toMatch(/suggestion && !message\.trim\(\)/);
    expect(textPanel).toMatch(/onMessageChange\(t\(suggestion\)\)/);
  });

  it('is computed from the main bundle, never through the vibe worker', () => {
    expect(hook).toMatch(/readPhotoMoment/);
    // `vibe.js` is the worker wrapper that fetches the ~10MB model; the
    // hook must not touch it, or the free path stops being free.
    expect(hook).not.toMatch(/suggestVibe|from '\.\/vibe'/);
  });

  it('holds one line per photo rather than rerolling on every render', () => {
    // `momentCaptionFor` picks at random from the season/time-of-day
    // pool, so an unmemoized call would reword the suggestion under the
    // reader mid-glance.
    expect(hook).toMatch(/useMemo/);
  });

  it('is still the last rung of the vibe panel’s own caption chain', () => {
    expect(vibePanel).toMatch(/momentCaption/);
  });
});
