import { describe, expect, it, vi } from 'vitest';
import { momentCaptionFor, readPhotoMoment } from './photoMoment';
import en from './i18n/en';

describe('readPhotoMoment', () => {
  it('forwards the browser timezone alongside the bytes', () => {
    const read_photo_moment = vi.fn(() => null);
    readPhotoMoment({ read_photo_moment }, new Uint8Array([1, 2, 3]));

    expect(read_photo_moment).toHaveBeenCalledTimes(1);
    const [bytes, zone] = read_photo_moment.mock.calls[0];
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    // Whatever the test environment's zone is, it has to be a string --
    // the binding takes `&str`, and wasm-bindgen reads `.length` off a
    // missing one, throwing a message that names nothing in this
    // codebase. See `wasm-call-sites.test.js`.
    expect(typeof zone).toBe('string');
  });

  it('is null rather than a throw when the binding fails', () => {
    const wasmModule = {
      read_photo_moment: () => {
        throw new Error('boom');
      },
    };
    expect(readPhotoMoment(wasmModule, new Uint8Array())).toBeNull();
  });

  it('turns the binding’s null into a plain null', () => {
    expect(readPhotoMoment({ read_photo_moment: () => null }, new Uint8Array())).toBeNull();
    expect(readPhotoMoment({ read_photo_moment: () => undefined }, new Uint8Array())).toBeNull();
  });
});

describe('momentCaptionFor', () => {
  it('has nothing to say about a photo with no date', () => {
    expect(momentCaptionFor(null)).toBeNull();
    expect(momentCaptionFor(undefined)).toBeNull();
  });

  it('draws on both the season and the hour when both are known', () => {
    const moment = { season: 'winter', timeOfDay: 'evening' };
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(momentCaptionFor(moment));

    // Eight lines in the pool: four winter, four evening. Both halves
    // have to be reachable -- always leading with the season would make
    // every photo from one trip open the same way.
    expect([...seen].some((k) => k.startsWith('moment.caption.winter.'))).toBe(true);
    expect([...seen].some((k) => k.startsWith('moment.caption.evening.'))).toBe(true);
  });

  it('still has a line for a tropical photo, which claims no season', () => {
    // `Belt::Tropical` reports `season: null` on purpose -- December in
    // Singapore is not winter. The time of day carries it alone.
    const key = momentCaptionFor({ season: null, timeOfDay: 'morning' });
    expect(key).toMatch(/^moment\.caption\.morning\./);
  });

  it('is null for a time of day nothing was written for', () => {
    expect(momentCaptionFor({ season: null, timeOfDay: 'dusk' })).toBeNull();
  });

  it('only ever names keys the catalog actually carries', () => {
    const seasons = [null, 'spring', 'summer', 'autumn', 'winter'];
    const times = ['morning', 'afternoon', 'evening', 'night'];
    for (const season of seasons) {
      for (const timeOfDay of times) {
        for (let i = 0; i < 40; i += 1) {
          const key = momentCaptionFor({ season, timeOfDay });
          expect(en[key], `${key} is missing from en.js`).toBeTypeOf('string');
        }
      }
    }
  });
});
