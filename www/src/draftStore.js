/**
 * Autosaves the single in-progress postcard so an accidental reload
 * doesn't lose it. Deliberately plain `indexedDB`, not a Rust/wasm
 * persistence crate: the draft is one opaque blob (a photo plus a handful
 * of scalar settings), not queryable structured records, so there is no
 * calculation here for `postcard-calc` to own -- this is exactly the
 * "reading localStorage/FileReader" host-layer carve-out `budget_planner`'s
 * CLAUDE.md already draws, just against IndexedDB instead of
 * `localStorage` because the photo itself can be several megabytes.
 *
 * One record only, fixed key -- no multi-draft gallery in v1.
 */

const DB_NAME = 'postcard_maker';
const STORE_NAME = 'draft';
const KEY = 'current';

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
