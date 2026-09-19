import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A photo used to be a one-way door in both editors. In the collage the
// only file input lived inside `EmptySlot`, which unmounts the moment
// `slot.photo` is set; on the single-photo card there was no replace
// control at all. Either way the only way back was "Start over", which
// throws the whole card away rather than the one photo.
//
// This is a source-text guard in the same spirit as
// `wasm-call-sites.test.js` here and `no_debug_formatted_errors` in
// `postcard-wasm/src/message.rs`: there is no component-rendering harness
// in this suite, and the failure it protects against is a control quietly
// disappearing, which no reducer test can see.

const SRC = import.meta.dirname;
const read = (...parts) => fs.readFileSync(path.join(SRC, ...parts), 'utf8');

const collage = read('components', 'CollageEditor.jsx');
const slot = read('components', 'CollagePhotoSlot.jsx');
const canvas = read('components', 'PostcardCanvas.jsx');
const app = read('App.jsx');

describe('a filled collage slot can still be refilled', () => {
  it('renders the replace chip over the selected slot', () => {
    expect(collage).toMatch(/<ReplacePhotoButton\b/);
  });

  it('and a double-tap on any filled slot opens the same picker', () => {
    expect(collage).toMatch(/onDoubleTap=\{\(\) => requestReplace\(index\)\}/);
    expect(slot).toMatch(/recordTap\(/);
  });

  it('with one hidden input behind both paths', () => {
    expect(collage).toMatch(/<PhotoPickerInput\b/);
  });

  // The previous photo's object URL is the other half of the fix: revoked
  // too early and a failed pick blanks a slot that still had a good photo
  // in it; never revoked and every swap leaks a multi-megabyte blob.
  it('and hands the old object URL to the revoker', () => {
    const call = collage.match(/replaceSlotPhoto\(index, file, ([^)]*)\)/);
    expect(call).not.toBeNull();
    expect(call[1]).toBe('state.slots[index]?.photo?.url');
  });
});

describe('the single-photo card can take a different photo too', () => {
  it('renders the same chip over the photo', () => {
    expect(canvas).toMatch(/<ReplacePhotoButton\b/);
  });

  it('and double-tapping it asks to replace', () => {
    expect(canvas).toMatch(/recordTap\(taps\.current, done\)\) onReplacePhoto\(\)/);
  });

  // Not `openPhoto`: that one dispatches OPEN_PHOTO, which resets to
  // `initialState` and would throw away the message, stickers and doodle
  // along with the photo.
  it('through replacePhoto, which keeps the rest of the card', () => {
    expect(app).toMatch(/<PhotoPickerInput inputRef=\{pickerRef\} onPick=\{replacePhoto\}/);
    const fn = app.slice(app.indexOf('const replacePhoto'), app.indexOf('const resumeDraft'));
    expect(fn).toMatch(/type: 'REPLACE_PHOTO'/);
    expect(fn).not.toMatch(/type: 'OPEN_PHOTO'/);
  });
});
