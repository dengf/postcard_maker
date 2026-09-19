import { useMemo } from 'react';
import { momentCaptionFor, readPhotoMoment } from './photoMoment';

/**
 * A greeting line suggested from the photo's own date, or `null`.
 *
 * This is the whole point of `postcard_calc::moment` living in the *main*
 * wasm bundle rather than in `postcard-wasm-vibe`: it reads bytes that
 * are already inside the photo, so it can answer the instant a photo
 * opens, with no model, no worker and no network. Until this hook
 * existed its only caller was inside `VibePanel`'s `runSuggest`, which
 * meant the one suggestion that costs nothing was reachable only by
 * tapping "Suggest a look" -- and on the happy path only *after* the
 * ~13MB download it was built to avoid. That undercut the placement
 * argument entirely; this is what closes it.
 *
 * Memoized on the photo's bytes because `momentCaptionFor` picks at
 * random from the season/time-of-day pool: recomputing per render would
 * reword the suggestion while someone was reading it, the same trap
 * `VibePanel` already notes about rolling a fresh caption on re-render.
 * One photo, one line, until the photo changes.
 *
 * Returns an i18n key, not a sentence -- the caller translates, so the
 * suggestion follows a mid-edit language switch like everything else.
 */
export function useMomentCaption(wasmModule, photoBytes) {
  return useMemo(() => {
    if (!wasmModule || !photoBytes) return null;
    return momentCaptionFor(readPhotoMoment(wasmModule, photoBytes));
  }, [wasmModule, photoBytes]);
}
