/**
 * Autosaves the in-progress card so an accidental reload doesn't lose it.
 * Deliberately plain `indexedDB`, not a Rust/wasm persistence crate: a
 * draft is one opaque blob (photos plus a handful of scalar settings),
 * not queryable structured records, so there is no calculation here for
 * `postcard-calc` to own -- this is exactly the "reading
 * localStorage/FileReader" host-layer carve-out `budget_planner`'s
 * CLAUDE.md already draws, just against IndexedDB instead of
 * `localStorage` because a photo alone can be several megabytes.
 *
 * One record only, fixed key -- no multi-draft gallery in v1. That one
 * record now holds either kind of card, told apart by `kind`: a collage
 * writes `'collage'` and keeps its photos in `slots`, while the
 * single-photo flow keeps writing the shape it always has, with one
 * `photoBlob` and no `kind` at all. Records written before collages were
 * saved therefore read back as single-photo drafts with no migration,
 * which is why the check below is "is it a collage" rather than "is it a
 * postcard".
 *
 * **The photo is stored as bytes, not as a `Blob`.** WebKit aborts any
 * IndexedDB write whose value contains a `Blob` -- and aborts it with a
 * `null` error, so there is nothing for a `catch` to report. The draft
 * therefore wrote *nothing at all* in Safari: no resume banner, no
 * collage to come back to, and no sign that anything had failed. A
 * `Uint8Array` stores fine in every engine, so `packPhoto`/`unpackPhoto`
 * below convert at this boundary and every caller still deals in
 * `Blob`s. Records written by older builds hold a real `Blob` and are
 * read back unchanged, so nobody loses a draft to the change.
 */

const DB_NAME = 'postcard_maker';
const STORE_NAME = 'draft';
const KEY = 'current';

export const COLLAGE_KIND = 'collage';

export function isCollageDraft(draft) {
  return draft?.kind === COLLAGE_KIND;
}

/**
 * The photo the resume banner shows as its thumbnail. A collage has
 * several, and the first one filled is the one that answers "which
 * card?" -- `slots` is sparse while a collage is unfinished, which is
 * exactly when a draft exists to resume.
 */
export function draftThumbBlob(draft) {
  if (!draft) return null;
  if (isCollageDraft(draft)) return draft.slots?.find((slot) => slot?.photoBlob)?.photoBlob ?? null;
  return draft.photoBlob ?? null;
}

/** Marks a record field that holds a photo's bytes rather than a Blob,
 * so a record written by an older build is still recognisable. */
const PHOTO_BYTES = 'photo-bytes';

async function packPhoto(blob) {
  if (!(blob instanceof Blob)) return blob ?? null;
  return { stored: PHOTO_BYTES, type: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function unpackPhoto(value) {
  // An older record's `Blob` falls straight through, which is the whole
  // compatibility story -- there is no migration step.
  if (!value || value.stored !== PHOTO_BYTES) return value ?? null;
  return new Blob([value.bytes], { type: value.type });
}

/** The draft with its photos as bytes. Every `await` happens here rather
 * than inside the transaction below: an IndexedDB transaction closes as
 * soon as the task that opened it yields, so awaiting mid-transaction
 * would abort the write. */
export async function packDraft(draft) {
  if (!isCollageDraft(draft)) return { ...draft, photoBlob: await packPhoto(draft.photoBlob) };
  const slots = await Promise.all(
    (draft.slots ?? []).map(async (slot) =>
      slot ? { ...slot, photoBlob: await packPhoto(slot.photoBlob) } : slot,
    ),
  );
  return { ...draft, slots };
}

export function unpackDraft(draft) {
  if (!draft) return null;
  if (!isCollageDraft(draft)) return { ...draft, photoBlob: unpackPhoto(draft.photoBlob) };
  return {
    ...draft,
    slots: (draft.slots ?? []).map((slot) =>
      slot ? { ...slot, photoBlob: unpackPhoto(slot.photoBlob) } : slot,
    ),
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDraft(draft) {
  const record = await packDraft(draft);
  await withStore('readwrite', (store) => {
    store.put({ ...record, updatedAt: Date.now() }, KEY);
  });
}

export async function loadDraft() {
  const request = await withStore('readonly', (store) => store.get(KEY));
  return unpackDraft(request.result ?? null);
}

export async function clearDraft() {
  await withStore('readwrite', (store) => {
    store.delete(KEY);
  });
}
