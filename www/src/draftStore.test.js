import { describe, expect, it } from 'vitest';
import { COLLAGE_KIND, draftThumbBlob, isCollageDraft } from './draftStore';

// The store itself is IndexedDB and has nothing to test without a browser;
// these two decide what the resume banner shows and which editor a draft
// reopens in, which is where getting it wrong is silent.

const blob = (tag) => ({ tag });

describe('isCollageDraft', () => {
  it('recognises a collage', () => {
    expect(isCollageDraft({ kind: COLLAGE_KIND })).toBe(true);
  });

  // Single-photo drafts have always been written without a `kind`, and
  // records saved before collages were persisted still read back. A check
  // for `kind === 'postcard'` would send every one of them down the wrong
  // path, which is why the discriminator only has to identify collages.
  it('treats an older, kindless record as a single photo', () => {
    expect(isCollageDraft({ photoBlob: blob('a') })).toBe(false);
  });

  it('and copes with nothing at all', () => {
    expect(isCollageDraft(null)).toBe(false);
  });
});

describe('draftThumbBlob', () => {
  it('takes the single photo from a postcard draft', () => {
    expect(draftThumbBlob({ photoBlob: blob('a') })).toEqual(blob('a'));
  });

  // `slots` is sparse while a collage is unfinished -- which is exactly
  // when there is a draft to resume -- so the thumbnail can't just be
  // slot zero.
  it('takes the first filled slot from a collage', () => {
    const draft = { kind: COLLAGE_KIND, slots: [null, { photoBlob: blob('b') }, { photoBlob: blob('c') }] };
    expect(draftThumbBlob(draft)).toEqual(blob('b'));
  });

  it('and returns nothing for a collage with no photos yet', () => {
    expect(draftThumbBlob({ kind: COLLAGE_KIND, slots: [null, null] })).toBeNull();
    expect(draftThumbBlob(null)).toBeNull();
  });
});
