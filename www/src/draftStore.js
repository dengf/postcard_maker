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
  await withStore('readwrite', (store) => {
    store.put({ ...draft, updatedAt: Date.now() }, KEY);
  });
}

export async function loadDraft() {
  const request = await withStore('readonly', (store) => store.get(KEY));
  return request.result ?? null;
}

export async function clearDraft() {
  await withStore('readwrite', (store) => {
    store.delete(KEY);
  });
}
