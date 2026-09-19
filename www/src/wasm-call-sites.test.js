import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `template_geometry(aspect, coverage, side)` takes three `&str`. Called
// with fewer, wasm-bindgen reaches for `.length` on an undefined string and
// throws "undefined is not an object (evaluating 'n.length')" -- a message
// that names nothing in this codebase and points at no line of it.
//
// That shipped. `CollageEditor` called `wasmModule.template_geometry(aspectId)`
// directly, so entering the collage editor threw before `selectLayout` could
// run, the editor rendered zero slots, and there was no way to add a photo
// at all. It went unnoticed because the throw was caught and routed to a
// toast that, at the time, rendered blank (see `ErrorToast`'s fallback
// chain).
//
// `photoLayout.js`'s `templateGeometry` wrapper exists precisely so no call
// site has to remember the argument list -- and `photoLayout.test.js`
// already pins what it forwards. This guards the other half: that the
// wrapper is the only caller. A source-text guard in the same spirit as
// `untranslated-strings.test.js` here and `no_debug_formatted_errors` in
// `postcard-wasm/src/message.rs`.

const SRC = import.meta.dirname;
const WRAPPER = 'photoLayout.js';

/** Every `.js`/`.jsx` source under src/, minus tests, with comments stripped. */
function sources(dir = SRC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' ? [] : sources(full);
    if (!/\.jsx?$/.test(entry.name) || /\.test\.jsx?$/.test(entry.name)) return [];
    return [
      {
        file: path.relative(SRC, full),
        source: fs
          .readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, ''),
      },
    ];
  });
}

describe('wasm call sites', () => {
  it('reaches template_geometry only through the templateGeometry wrapper', () => {
    const direct = sources()
      .filter(({ file }) => file !== WRAPPER)
      .filter(({ source }) => /\.template_geometry\s*\(/.test(source))
      .map(({ file }) => file);

    expect(direct).toEqual([]);
  });

  // The wrapper is only worth anything if it actually passes all three.
  it('and the wrapper forwards three arguments', () => {
    const wrapper = fs.readFileSync(path.join(SRC, WRAPPER), 'utf8');
    const call = wrapper.match(/\.template_geometry\(([^)]*)\)/);
    expect(call).not.toBeNull();
    expect(call[1].split(',')).toHaveLength(3);
  });
});
