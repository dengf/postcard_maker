import { describe, expect, it } from 'vitest';
import { COLLAGE_KIND, draftThumbBlob, isCollageDraft, packDraft, unpackDraft } from './draftStore';

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
    const draft = {
      kind: COLLAGE_KIND,
      slots: [null, { photoBlob: blob('b') }, { photoBlob: blob('c') }],
    };
    expect(draftThumbBlob(draft)).toEqual(blob('b'));
  });

  it('and returns nothing for a collage with no photos yet', () => {
    expect(draftThumbBlob({ kind: COLLAGE_KIND, slots: [null, null] })).toBeNull();
    expect(draftThumbBlob(null)).toBeNull();
  });
});

// WebKit aborts an IndexedDB write whose value holds a `Blob`, with a
// null error nothing can catch -- so the draft silently wrote nothing at
// all in Safari. The record holds bytes now; these guard that the
// conversion is invisible to every caller, and that a record written
// before the change still reads back.
const photo = (text, type = 'image/jpeg') => new Blob([text], { type });
const bytesOf = async (blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));

describe('packDraft / unpackDraft', () => {
  it('stores a single photo as bytes and gives a Blob back', async () => {
    const packed = await packDraft({ photoBlob: photo('hello'), zoom: 1.5 });

    expect(packed.photoBlob).not.toBeInstanceOf(Blob);
    expect(packed.photoBlob.bytes).toBeInstanceOf(Uint8Array);
    expect(packed.zoom).toBe(1.5);

    const back = unpackDraft(packed);
    expect(back.photoBlob).toBeInstanceOf(Blob);
    expect(back.photoBlob.type).toBe('image/jpeg');
    expect(await bytesOf(back.photoBlob)).toEqual(await bytesOf(photo('hello')));
    expect(back.zoom).toBe(1.5);
  });

  it('does the same for every filled slot of a collage, and leaves the gaps', async () => {
    const draft = {
      kind: COLLAGE_KIND,
      layoutId: 'g7-3',
      slots: [null, { photoBlob: photo('b'), zoom: 2 }, null],
    };
    const packed = await packDraft(draft);

    expect(packed.slots[0]).toBeNull();
    expect(packed.slots[1].photoBlob.bytes).toBeInstanceOf(Uint8Array);
    expect(packed.slots[1].zoom).toBe(2);

    const back = unpackDraft(packed);
    expect(back.layoutId).toBe('g7-3');
    expect(back.slots[0]).toBeNull();
    expect(back.slots[2]).toBeNull();
    expect(back.slots[1].photoBlob).toBeInstanceOf(Blob);
    expect(await bytesOf(back.slots[1].photoBlob)).toEqual(await bytesOf(photo('b')));
  });

  // The compatibility case: a record an older build wrote holds a real
  // Blob, and has to come back untouched rather than be mistaken for a
  // packed one and turned into nothing.
  it('reads an older record that holds a Blob straight through', async () => {
    const old = photo('legacy');
    expect(unpackDraft({ photoBlob: old }).photoBlob).toBe(old);
    expect(
      unpackDraft({ kind: COLLAGE_KIND, slots: [{ photoBlob: old }] }).slots[0].photoBlob,
    ).toBe(old);
  });

  it('copes with a draft that has no photo yet, and with nothing at all', async () => {
    expect((await packDraft({ zoom: 1 })).photoBlob).toBeNull();
    expect(unpackDraft({ zoom: 1 }).photoBlob).toBeNull();
    expect(unpackDraft(null)).toBeNull();
    expect((await packDraft({ kind: COLLAGE_KIND })).slots).toEqual([]);
  });
});
