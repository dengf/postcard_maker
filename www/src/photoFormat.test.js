import { describe, expect, it } from 'vitest';
import { isLikelyHeic, unreadablePhotoError } from './photoFormat';

const file = (name, type) => ({ name, type });

describe('isLikelyHeic', () => {
  it('recognizes the declared HEIC/HEIF types', () => {
    expect(isLikelyHeic(file('IMG_0001.HEIC', 'image/heic'))).toBe(true);
    expect(isLikelyHeic(file('x', 'image/heif'))).toBe(true);
    expect(isLikelyHeic(file('x', 'image/heic-sequence'))).toBe(true);
  });

  // The case that actually matters: a platform that doesn't recognize the
  // format hands over an empty `type`, so the extension is all there is.
  it('falls back to the extension when the type is empty', () => {
    expect(isLikelyHeic(file('IMG_0001.HEIC', ''))).toBe(true);
    expect(isLikelyHeic(file('photo.heif', undefined))).toBe(true);
  });

  it('is case-insensitive about both', () => {
    expect(isLikelyHeic(file('IMG.Heic', 'IMAGE/HEIC'))).toBe(true);
  });

  it('leaves ordinary photos alone', () => {
    expect(isLikelyHeic(file('beach.jpg', 'image/jpeg'))).toBe(false);
    expect(isLikelyHeic(file('shot.png', 'image/png'))).toBe(false);
    // A name that merely contains the letters, not an extension.
    expect(isLikelyHeic(file('heiction.jpg', 'image/jpeg'))).toBe(false);
  });

  it('does not throw on a missing file or missing fields', () => {
    expect(isLikelyHeic(null)).toBe(false);
    expect(isLikelyHeic(undefined)).toBe(false);
    expect(isLikelyHeic({})).toBe(false);
  });
});

describe('unreadablePhotoError', () => {
  it('names HEIC when it is HEIC, so the message can point somewhere', () => {
    expect(unreadablePhotoError(file('IMG_0001.HEIC', 'image/heic'))).toEqual({
      code: 'err.heicUnsupported',
    });
  });

  it('stays generic for anything else that failed to decode', () => {
    expect(unreadablePhotoError(file('broken.jpg', 'image/jpeg'))).toEqual({
      code: 'err.unreadableImage',
    });
  });
});
