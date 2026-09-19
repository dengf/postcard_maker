import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A filled collage slot used to be a one-way door. The only file input in
// the editor lived inside `EmptySlot`, which unmounts the moment
// `slot.photo` is set, so picking the wrong photo for a slot left "Start
// over" -- which throws the whole collage away -- as the only way back.
//
// This is a source-text guard in the same spirit as
// `wasm-call-sites.test.js` here and `no_debug_formatted_errors` in
// `postcard-wasm/src/message.rs`: there is no component-rendering harness
// in this suite, and the failure it protects against is a control quietly
// disappearing, which no reducer test can see.

const SRC = import.meta.dirname;
const EDITOR = path.join(SRC, 'components', 'CollageEditor.jsx');

const source = fs.readFileSync(EDITOR, 'utf8');

describe('a filled collage slot can still be refilled', () => {
  it('renders the replace control alongside the photo', () => {
    expect(source).toMatch(/<ReplaceSlotPhoto\b/);
  });

  it('and that control carries a file input of its own', () => {
    const component = source.slice(source.indexOf('function ReplaceSlotPhoto'));
    expect(component).toMatch(/type="file"/);
  });

  // The previous photo's object URL is the second half of the fix: revoked
  // too early and a failed pick blanks a slot that still had a good photo
  // in it; never revoked and every swap leaks a multi-megabyte blob.
  it('and hands the old object URL to the revoker', () => {
    const call = source.match(/replaceSlotPhoto\(index, file, ([^)]*)\)/);
    expect(call).not.toBeNull();
    expect(call[1]).toBe('slot.photo.url');
  });
});
