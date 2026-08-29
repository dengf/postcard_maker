import React, { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { suggestVibe } from "../vibe";
import { buildCandidates } from "../vibeSuggestions";
import { captionFor } from "../vibeCaptions";
import { photoTone } from "../photoTone";
import { suggestExposure } from "../exposureSuggestion";
import { suggestGroup, groupCaptionFor } from "../groupSuggestion";
import { useIsNarrow } from "../useIsNarrow";

// 2, not more: every vibe has a large pool of look variants (see
// vibeSuggestions.js's filter x sticker cross product), and the single
// most common outcome is one matched vibe -- still a pool well over 2.
// Showing 2 up front always leaves plenty for "Try other ideas" to
// shuffle into, even in that overwhelmingly common single-vibe case.
// On the phone-width layout only 1 shows at a time -- each chip already
// has its own label plus an Apply button, and this panel sits at the
// very top of the control stack, so 2 full chips can push everything
// else below the fold before a user has even opened a photo's worth of
// controls.
const DESKTOP_VISIBLE_COUNT = 2;
const NARROW_VISIBLE_COUNT = 1;

/**
 * Vibe-based candidates (from `buildCandidates`) carry an `openerKey` +
 * `closerKey` pair plus three sub-keys (`vibeLabelKey`/`filterLabelKey`/
 * `stickerLabelKey`) instead of one fixed `labelKey` -- see
 * `vibeSuggestions.js`'s module doc comment for why: composing the full
 * sentence from small already-translated pieces at render time is what
 * makes a 124-look pool with ~100 possible phrasings maintainable
 * without hundreds of hand-translated strings. Exposure and group
 * candidates (`exposureSuggestion.js`/`groupSuggestion.js`) have no
 * cross product to compose from, so they still carry one plain
 * `labelKey` -- this falls back to that whenever `openerKey` is absent.
 */
function labelFor(t, candidate) {
  if (!candidate.openerKey) return t(candidate.labelKey);
  const opener = t(candidate.openerKey, {
    vibeLabel: t(candidate.vibeLabelKey),
  });
  const closer = t(candidate.closerKey, {
    filterLabel: t(candidate.filterLabelKey),
    stickerLabel: candidate.stickerLabelKey
      ? t(candidate.stickerLabelKey)
      : undefined,
  });
  return `${opener} — ${closer}`;
}

/**
 * "Suggest a look" -- see CLAUDE.md for the full architecture. Never
 * downloads the model until this button is tapped; never blocks editing
 * if the analysis is slow, fails, or has nothing to suggest.
 *
 * Shows up to `VISIBLE_COUNT` look candidates at once (built from the
 * model's own top matched vibes plus each vibe's alternate looks, plus
 * an `exposureSuggestion.js` brightness/contrast/saturation candidate
 * and a `groupSuggestion.js` "people are together" candidate, either of
 * which can fire even when `matches` is empty), with a "Try other ideas"
 * button that rotates the window over the rest of the candidate pool
 * rather than re-running the model -- classification only ever runs once
 * per tap. Exposure and group are the two things here that still have
 * something to offer a photo the vibe classifier structurally can't --
 * a photo of people, most notably, since ImageNet has almost no classes
 * for that. Neither needs object recognition: exposure reads the
 * photo's own pixel statistics, group reads a face count from a second,
 * much smaller model (`count_faces`) downloaded alongside the vibe one.
 */
export default function VibePanel({
  photoBytes,
  onApply,
  onSetMessage,
  onError,
}) {
  const { t } = useI18n();
  const narrow = useIsNarrow();
  const visibleCount = narrow ? NARROW_VISIBLE_COUNT : DESKTOP_VISIBLE_COUNT;
  const [phase, setPhase] = useState("idle"); // idle | loading | result | empty
  const [candidates, setCandidates] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [caption, setCaption] = useState(null);
  // 0..1 while the ~10MB model downloads, or null before any progress
  // has arrived yet (nothing to show) -- see `vibe.js`'s own doc comment
  // for why this exists: on a slow connection this download can be the
  // entire wait, and a static "Analyzing…" label with nothing else
  // moving reads as stuck rather than working.
  const [progress, setProgress] = useState(null);

  const runSuggest = async () => {
    setPhase("loading");
    setProgress(null);
    try {
      const result = await suggestVibe(photoBytes, setProgress);
      if (result?.error) {
        onError(result.error_message ?? { text: result.error });
        setPhase("idle");
        return;
      }
      const matches = result?.matches ?? [];
      // Best-effort: a photo this classifier already accepted decodes
      // fine, so this essentially never fails, but the suggestion itself
      // -- not this refinement -- is the thing that must never break.
      const tone = await photoTone(photoBytes).catch(() => null);
      // The vibe classifier has nothing for it to work with, since
      // ImageNet has almost no "person" classes -- a photo of people
      // (probably the majority of real postcard photos) would otherwise
      // always land here empty. `suggestExposure` needs no object
      // recognition at all, just the photo's own pixel statistics, so it
      // still has something useful to offer even when `matches` is
      // empty.
      const exposure = suggestExposure(tone);
      // Same reasoning as `exposure`: `count_faces` needs no object
      // recognition either, so a photo of two or more people still gets
      // something useful even when `matches` is empty -- see
      // `groupSuggestion.js`.
      const group = suggestGroup(result?.faceCount ?? 0);
      const vibeCandidates = buildCandidates(matches, tone);
      const allCandidates = [...vibeCandidates, exposure, group].filter(
        Boolean,
      );
      if (allCandidates.length === 0) {
        setPhase("empty");
        return;
      }
      setCandidates(allCandidates);
      setCursor(0);
      // Picked once per suggestion run, not on every re-render -- rolling
      // a fresh random caption on every shuffle/dismiss re-render would
      // change the displayed line for reasons that have nothing to do
      // with the caption itself.
      const topVibe = matches[0]?.vibe ?? null;
      setCaption(
        (topVibe ? captionFor(topVibe) : null) ??
          groupCaptionFor(result?.faceCount ?? 0),
      );
      setPhase("result");
    } catch (err) {
      onError({ text: err?.message ?? String(err) });
      setPhase("idle");
    }
  };

  const visible = useMemo(() => {
    if (candidates.length === 0) return [];
    const out = [];
    for (let i = 0; i < Math.min(visibleCount, candidates.length); i += 1) {
      out.push(candidates[(cursor + i) % candidates.length]);
    }
    return out;
  }, [candidates, cursor, visibleCount]);

  const apply = (candidate) => {
    onApply(candidate);
    setPhase("idle");
  };

  const shuffle = () =>
    setCursor((c) => (c + visibleCount) % candidates.length);

  const dismiss = () => setPhase("idle");

  const useCaption = () => {
    if (caption) onSetMessage(t(caption));
  };

  return (
    <div className="panel vibe-panel">
      <button
        type="button"
        className="btn secondary"
        onClick={runSuggest}
        disabled={phase === "loading"}
      >
        {phase === "loading"
          ? progress != null
            ? t("vibe.analyzingProgress", {
                percent: Math.round(progress * 100),
              })
            : t("vibe.analyzing")
          : t("vibe.suggest")}
      </button>

      {phase === "loading" && (
        <div
          className="vibe-progress-track"
          role="progressbar"
          aria-label={t("vibe.analyzing")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            progress != null ? Math.round(progress * 100) : undefined
          }
        >
          <div
            className={
              progress != null
                ? "vibe-progress-fill"
                : "vibe-progress-fill indeterminate"
            }
            style={
              progress != null
                ? { width: `${Math.max(6, progress * 100)}%` }
                : undefined
            }
          />
        </div>
      )}

      {phase === "result" && visible.length > 0 && (
        <div className="vibe-results">
          {visible.map((c, i) => (
            <div
              className="vibe-chip"
              key={`${c.vibe ?? "x"}-${c.filter ?? ""}-${c.sticker ?? ""}-${c.labelKey ?? c.openerKey}-${i}`}
            >
              <span>{labelFor(t, c)}</span>
              <div className="vibe-chip-actions">
                <button type="button" className="btn link primary" onClick={() => apply(c)}>
                  {t("vibe.apply")}
                </button>
                <button type="button" className="btn link" onClick={dismiss}>
                  {t("vibe.dismiss")}
                </button>
                {/* Only one card shows at a time on phones (visible.length
                    === 1), so "try another one" belongs on that card's own
                    action row. With 2+ cards shown at once (desktop), it
                    cycles the whole shown set rather than any single card,
                    so it stays in its own row below instead -- see the
                    block right after this map. */}
                {visible.length === 1 && candidates.length > visibleCount && (
                  <button type="button" className="btn link" onClick={shuffle}>
                    {t("vibe.shuffle")}
                  </button>
                )}
              </div>
            </div>
          ))}

          {visible.length > 1 && candidates.length > visibleCount && (
            <div className="vibe-panel-actions">
              <button type="button" className="btn ghost" onClick={shuffle}>
                {t("vibe.shuffle")}
              </button>
            </div>
          )}

          {caption && (
            <div className="vibe-caption">
              <p className="text-option-note">{t(caption)}</p>
              <button type="button" className="btn ghost" onClick={useCaption}>
                {t("vibe.useCaption")}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "empty" && (
        <p className="text-option-note">{t("vibe.noSuggestion")}</p>
      )}
    </div>
  );
}
