import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { ASPECTS, aspectRatio } from '../aspect';
import { clampZoom, rebaseCrop, zoomedCrop } from '../cropGesture';
import { fitZoom, photoFit } from '../letterbox';
import { cropMathFor, rotatedBounds, suggestRotatedCrop } from '../rotateGeometry';
import { effectiveFont } from '../fonts';
import { detectLocation } from '../location';
import { renderCollage } from '../export';
import { templateGeometry } from '../photoLayout';
import { previewFilterCss } from '../previewFilter';
import { useMomentCaption } from '../useMomentCaption';
import { unreadablePhotoError } from '../photoFormat';
import { COLLAGE_KIND, saveDraft } from '../draftStore';
import { collageReducer, emptySlot, initialCollageState } from '../collageReducer';
import { carrySlots, randomSeed, slotPixelRatio, withSelected } from '../collageLayouts';
import { DEFAULT_ADJUSTMENTS, nextStickerKey } from '../postcardReducer';
import TemplatePicker from './TemplatePicker';
import FilterPanel from './FilterPanel';
import TextPanel from './TextPanel';
import StickerPalette from './StickerPalette';
import DoodleToolbar from './DoodleToolbar';
import BackSidePanel from './BackSidePanel';
import ShareBar from './ShareBar';
import PostcardOverlay from './PostcardOverlay';
import DoodleLayer from './DoodleLayer';
import CollagePhotoSlot from './CollagePhotoSlot';
import ReplacePhotoButton, { PhotoPickerInput } from './ReplacePhotoButton';
import { BackIcon, DiceIcon, ImageIcon } from './icons';

/** Matches the single-photo flow's own debounce -- see `App.jsx`. */
const AUTOSAVE_DELAY_MS = 800;

function loadImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`could not read dimensions for ${url}`));
    img.src = url;
  });
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * The slot the greeting sits on, and where the message box lands inside
 * that slot's own photo -- in the 0..1 space `PostcardOverlay`'s 'auto'
 * ink sampler wants, i.e. a fraction of the slot, not of the card.
 *
 * A collage has no single photo, which is why the shared overlay fell
 * back to a fixed dark ink here. But the message box does sit over one
 * particular slot, and that slot has a real photo to read -- and
 * `export.js`'s `renderCollage` samples the composited canvas under the
 * box, so it has always answered for whichever photo is there. The
 * editor showed dark ink on a dark photo while the saved file came out
 * white and correct. Picking the slot by the box's own centre is what
 * makes the two track each other, including after the box is dragged
 * onto a different photo.
 *
 * A box centred on an empty slot, or a card with nothing in it yet, has
 * nothing to sample and still falls back.
 */
function messageSlotSample(slots, layout, box) {
  if (!layout || !box) return null;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const index = layout.slots.findIndex(
    ({ area: a }) => cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h,
  );
  const slot = index >= 0 ? slots[index] : null;
  if (!slot?.photo) return null;
  const a = layout.slots[index].area;
  const x = clamp01((box.x - a.x) / a.w);
  const y = clamp01((box.y - a.y) / a.h);
  return { slot, area: { x, y, w: Math.min(box.w / a.w, 1 - x), h: Math.min(box.h / a.h, 1 - y) } };
}

/**
 * The record `draftStore` keeps for a collage. `kind` is what tells it
 * apart from the single-photo shape, which carries no `kind` at all --
 * see `draftStore.js`. Named rather than built inline in the autosave
 * effect because Back saves the same thing without waiting out the
 * debounce.
 */
function collageDraft(state, aspectId) {
  return {
    kind: COLLAGE_KIND,
    aspectId,
    layoutId: state.layoutId,
    slots: state.slots.map((slot) =>
      slot.photo
        ? {
            photoBlob: new Blob([slot.photo.bytes], { type: slot.photo.mimeType }),
            crop: slot.crop,
            zoom: slot.zoom,
            rotation: slot.rotation,
            adjustments: slot.adjustments,
            filter: slot.filter,
          }
        : null,
    ),
    message: state.message,
    fontChoice: state.fontChoice,
    fontScale: state.fontScale,
    textColor: state.textColor,
    textAlign: state.textAlign,
    messagePosition: state.messagePosition,
    stickers: state.stickers,
    strokes: state.strokes,
    strokeColor: state.strokeColor,
    strokeWidth: state.strokeWidth,
    backSide: state.backSide,
  };
}

/**
 * The multi-photo collage flow -- a parallel state machine to the
 * single-photo `App.jsx`, not a variant of it. See CLAUDE.md for why.
 */
export default function CollageEditor({ wasmModule, onError, onExit, onBack, draft }) {
  const { t, locale } = useI18n();
  const [aspectId, setAspectId] = useState(draft?.aspectId ?? ASPECTS[0].id);
  const [layouts, setLayouts] = useState([]);
  // The layout in use, held here rather than looked up in `layouts` by
  // `state.layoutId`: a shuffle replaces the offered row, and the card
  // must keep the arrangement it is already drawn with even once that
  // arrangement is no longer one of the six on offer.
  const [layout, setLayout] = useState(null);
  const [geometry, setGeometry] = useState(null);
  // Counts shuffles, purely so the swatch row can be remounted and
  // replay its deal animation -- see `shuffleLayouts`.
  const [deals, setDeals] = useState(0);
  const [state, dispatch] = useReducer(collageReducer, null, () => initialCollageState('', 0));
  const objectUrlsRef = useRef([]);
  const frameRef = useRef(null);
  const pickerRef = useRef(null);
  const pendingSlotRef = useRef(0);
  // A draft is consumed once. Both refs guard against the effects below
  // re-running -- on a shape change, or on StrictMode's deliberate
  // double-invoke in dev -- and restoring the same photos a second time.
  const pendingDraftRef = useRef(draft ?? null);
  const hydratingRef = useRef(false);
  // Which row of layouts is on offer. A ref, not state: the row survives
  // a change of template shape (your shuffle isn't undone by trying the
  // card portrait), so nothing should re-run when it changes -- only the
  // Shuffle button and the shape effect read it, and both do so while
  // already doing the work.
  const seedRef = useRef(randomSeed());
  // The current state, for `selectLayout` -- which has to read the slots
  // it is moving onto the new layout without being rebuilt (and
  // re-running the effect below) every time one of them changes.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Moves the collage onto `next`, keeping the photos already placed --
   * see `collageLayouts.js`'s `carrySlots`. Both halves have to travel
   * together: `layout` is the geometry every slot is positioned and
   * cropped against, and `state.slots` is what fills it.
   */
  const selectLayout = useCallback(
    (next) => {
      setLayout(next);
      dispatch({
        type: 'SET_LAYOUT',
        layoutId: next.id,
        slots: carrySlots(
          wasmModule,
          stateRef.current.slots,
          next,
          aspectRatio(aspectId),
          emptySlot,
        ),
      });
    },
    [wasmModule, aspectId],
  );

  /** Deals a new row of layouts. Only the offer changes -- the card keeps
   * the layout it has until a swatch is actually tapped, which is why
   * this doesn't call `selectLayout`. */
  const shuffleLayouts = useCallback(() => {
    seedRef.current = randomSeed();
    try {
      setLayouts(wasmModule.collage_shuffle(aspectId, seedRef.current));
      // Remounts the row so its deal animation runs again (a changed
      // `key` is the only thing that restarts a CSS animation on an
      // element that stays put). Under `prefers-reduced-motion` the
      // animation is off and this is a no-op remount.
      setDeals((n) => n + 1);
    } catch (err) {
      onError(err);
    }
  }, [wasmModule, aspectId, onError]);

  // Deals the row and settles on a layout whenever the template shape
  // changes (and once on mount).
  useEffect(() => {
    try {
      const row = wasmModule.collage_shuffle(aspectId, seedRef.current);
      setLayouts(row);
      // Through `templateGeometry`, never `wasmModule.template_geometry`
      // directly: the binding takes (aspect, coverage, side), and this
      // call passed the aspect alone. wasm-bindgen then read `.length`
      // off an undefined string and threw -- on every entry to the
      // collage editor, which meant `selectLayout` below never ran and
      // the editor rendered zero slots. A collage fills the whole card,
      // so coverage is 'full', which makes `side` moot (as
      // `postcard_calc::template`'s own doc comment notes) but still
      // required.
      setGeometry(templateGeometry(wasmModule, aspectId, 'full', 'first'));
      // Which layout to land on, in order: the one a draft was saved
      // with, then the one already in use, then the first on offer.
      //
      // The first two go back through Rust rather than being reused as
      // they are, because a layout is built *for* a card shape -- the
      // same id against a different aspect is the corresponding
      // arrangement for that shape, not the same rectangles. That is
      // also what lets a draft saved before generated layouts existed
      // reopen: `collage_layout` still answers for the old curated ids.
      const wanted = pendingDraftRef.current?.layoutId ?? stateRef.current.layoutId;
      const target = (wanted && wasmModule.collage_layout(aspectId, wanted)) || row[0];
      if (target) selectLayout(target);
    } catch (err) {
      onError(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectLayout changes
    // with aspectId, which is already a dep; adding it would re-run on nothing else.
  }, [aspectId, wasmModule]);

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  /** Fills or refills one slot. Returns whether it took. */
  const openSlotPhoto = useCallback(
    async (index, file) => {
      if (!layout) return false;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      try {
        const { w, h } = await loadImageDimensions(url);
        const ratio = slotPixelRatio(layout.slots[index].area, aspectRatio(aspectId));
        const base = wasmModule.suggest_crop_ratio(w, h, ratio);
        dispatch({
          type: 'OPEN_SLOT_PHOTO',
          index,
          photo: { bytes, url, naturalW: w, naturalH: h, mimeType: file.type || 'image/jpeg' },
          base,
        });
        dispatch({ type: 'SET_ACTIVE_SLOT', index });
        return true;
      } catch (err) {
        // Same treatment the single-photo flow gives a photo the browser
        // can't decode: an uncoded failure here is `loadImageDimensions`
        // rejecting, and naming HEIC beats surfacing "could not read
        // dimensions for blob:...".
        onError(err?.code ? err : unreadablePhotoError(file));
        return false;
      }
    },
    [layout, aspectId, wasmModule, onError],
  );

  /**
   * Swaps the photo already in a slot. Until this existed a slot was a
   * one-way door: the file input lives in `EmptySlot`, which is gone the
   * moment a photo lands, so the only way to change your mind was Start
   * over -- which discards the whole collage, not the one photo.
   *
   * The previous object URL is revoked only once the new photo is
   * actually in, so a file the browser rejects (see above) leaves the
   * slot showing what it showed before rather than a broken image.
   */
  const replaceSlotPhoto = useCallback(
    async (index, file, previousUrl) => {
      const ok = await openSlotPhoto(index, file);
      if (!ok || !previousUrl) return;
      URL.revokeObjectURL(previousUrl);
      objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== previousUrl);
    },
    [openSlotPhoto],
  );

  /**
   * Opens the picker for one slot. Both ways in -- the chip and a
   * double-tap on the photo -- come through here, so there is one hidden
   * input for the whole editor and the slot index lives in a ref beside
   * it rather than in whichever chip happens to be mounted.
   */
  const requestReplace = useCallback((index) => {
    pendingSlotRef.current = index;
    pickerRef.current?.click();
  }, []);

  const onPickedReplacement = useCallback(
    (file) => {
      const index = pendingSlotRef.current;
      replaceSlotPhoto(index, file, state.slots[index]?.photo?.url);
    },
    [replaceSlotPhoto, state.slots],
  );

  /**
   * Rebuilds a saved collage once its layout is in place. The blobs come
   * back from IndexedDB as bytes, so every slot has to be decoded again
   * to recover its natural size, and the base crop is recomputed rather
   * than stored -- it's derived from the slot's own share of the card,
   * which the layout already knows, and storing a derived value is how
   * it goes stale when a layout's proportions change.
   *
   * A slot whose blob no longer decodes is left empty instead of failing
   * the whole restore: getting three of four photos back beats getting a
   * toast and an empty card.
   */
  useEffect(() => {
    const saved = pendingDraftRef.current;
    if (!saved || !layout || hydratingRef.current) return;
    hydratingRef.current = true;
    pendingDraftRef.current = null;

    let cancelled = false;
    (async () => {
      const slots = await Promise.all(
        state.slots.map(async (empty, index) => {
          const stored = saved.slots?.[index];
          if (!stored?.photoBlob) return empty;
          const url = URL.createObjectURL(stored.photoBlob);
          try {
            const bytes = new Uint8Array(await stored.photoBlob.arrayBuffer());
            const { w, h } = await loadImageDimensions(url);
            const ratio = slotPixelRatio(layout.slots[index].area, aspectRatio(saved.aspectId));
            // Base crops are recomputed on restore, never stored -- and
            // once a slot can be turned, the one to recompute is the one
            // for *its* angle, or the photo reopens framed differently
            // from how it was saved.
            const turn = stored.rotation ?? 0;
            const base = suggestRotatedCrop(wasmModule, w, h, turn, ratio);
            return {
              photo: {
                bytes,
                url,
                naturalW: w,
                naturalH: h,
                mimeType: stored.photoBlob.type || 'image/jpeg',
              },
              baseCrop: base,
              crop: stored.crop ?? base,
              zoom: stored.zoom ?? 1,
              rotation: turn,
              adjustments: stored.adjustments ?? DEFAULT_ADJUSTMENTS,
              filter: stored.filter ?? 'none',
            };
          } catch {
            URL.revokeObjectURL(url);
            return empty;
          }
        }),
      );
      if (cancelled) {
        for (const slot of slots) if (slot.photo) URL.revokeObjectURL(slot.photo.url);
        return;
      }
      for (const slot of slots) if (slot.photo) objectUrlsRef.current.push(slot.photo.url);
      dispatch({ type: 'RESTORE_DRAFT', draft: saved, slots });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when
    // the saved layout arrives; `state.slots` is the empty set SET_LAYOUT just made.
  }, [layout]);

  const activeSlot = state.slots[state.activeSlotIndex];
  const anySlotFilled = state.slots.some((s) => s.photo);

  /**
   * Autosaves the collage, debounced like the single-photo flow's own
   * autosave and guarded on there being at least one photo. Without that
   * guard, merely tapping "Make a collage" would overwrite an unfinished
   * single-photo draft with an empty collage -- the store holds one
   * record, so an empty save is a destructive one.
   */
  useEffect(() => {
    if (!anySlotFilled || !state.layoutId) return undefined;
    const handle = setTimeout(() => {
      saveDraft(collageDraft(state, aspectId)).catch(() => {});
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [anySlotFilled, aspectId, state]);

  /**
   * Back to the intro, keeping the collage. It saves on the spot instead
   * of waiting out the debounce, so stepping away doesn't cost the last
   * thing you typed, and then it's App's problem -- which offers the
   * card again in the resume banner.
   */
  const backToIntro = useCallback(async () => {
    if (anySlotFilled && state.layoutId)
      await saveDraft(collageDraft(state, aspectId)).catch(() => {});
    onBack();
  }, [anySlotFilled, state, aspectId, onBack]);

  /* The rotated-crop geometry for one slot's photo, against that slot's
   * own on-card proportions. Rebuilt per render rather than memoised:
   * `usePhotoGestures` reads it through a ref, so a fresh object costs
   * nothing, and a stale one bound to the previous layout would frame
   * every gesture against the wrong shape. */
  const slotCropMath = (index, slot) =>
    cropMathFor(
      wasmModule,
      slot.photo.naturalW,
      slot.photo.naturalH,
      slotPixelRatio(layout.slots[index].area, aspectRatio(aspectId)),
    );

  /* How far out the active slot's photo is worth zooming -- per slot,
   * since each one cuts its photo to a different shape. See
   * `letterbox.js`. */
  const activeMinZoom = () => {
    if (!activeSlot?.photo) return undefined;
    const math = slotCropMath(state.activeSlotIndex, activeSlot);
    return fitZoom(activeSlot.baseCrop, math.bounds(activeSlot.rotation));
  };

  const changeActiveZoom = (nextZoom) => {
    if (!activeSlot?.photo) return;
    const math = slotCropMath(state.activeSlotIndex, activeSlot);
    const bounds = math.bounds(activeSlot.rotation);
    const wanted = clampZoom(nextZoom, fitZoom(activeSlot.baseCrop, bounds));
    const crop = zoomedCrop(activeSlot.crop, activeSlot.baseCrop, bounds.w, bounds.h, wanted);
    dispatch({
      type: 'SET_SLOT_ZOOM',
      index: state.activeSlotIndex,
      crop: math.fit(crop, activeSlot.rotation),
      zoom: wanted,
    });
  };

  /* Turning the active slot's photo from the panel. Same three-part move
   * as `App.jsx`'s `rotateTo` -- the angle, the zoom-1 crop that fits at
   * it, and the current crop carried into the new box -- worked out here
   * where the wasm module is, not in the reducer. */
  const rotateActiveSlot = (nextRotation) => {
    if (!activeSlot?.photo) return;
    const index = state.activeSlotIndex;
    const math = slotCropMath(index, activeSlot);
    const from = math.bounds(activeSlot.rotation);
    const to = math.bounds(nextRotation);
    const base = math.base(nextRotation);
    const carried = rebaseCrop(activeSlot.crop, from, to);
    // The zoom-out floor moved with the angle too -- same reasoning as
    // `App.jsx`'s `rotateTo`.
    const zoom = clampZoom(activeSlot.zoom, fitZoom(base, to));
    dispatch({
      type: 'SET_SLOT_ROTATION',
      index,
      rotation: nextRotation,
      base,
      crop: math.fit(zoomedCrop(carried, base, to.w, to.h, zoom), nextRotation),
      zoom,
    });
  };

  const addSticker = (id) => {
    const n = state.stickers.length;
    dispatch({
      type: 'ADD_STICKER',
      id,
      key: nextStickerKey(),
      x: 0.5 + ((n % 3) - 1) * 0.1,
      y: 0.5 + ((n % 2) - 0.5) * 0.14,
    });
  };

  const toggleBackSide = useCallback(
    (enabled) => {
      dispatch({ type: 'SET_BACK_SIDE_ENABLED', enabled });
      if (enabled && !state.backSide.location) {
        const guess = detectLocation();
        if (guess) dispatch({ type: 'SET_BACK_SIDE_LOCATION', location: guess });
      }
    },
    [state.backSide.location],
  );

  // A collage has several photos but one shared greeting, so the date
  // suggestion has to name a source rather than pick per slot. The
  // first *filled* slot in reading order is the stable answer: slot 0 is
  // always top-left (`collage_gen` guarantees reading order), and it
  // doesn't change as the active slot moves around under the cursor.
  const momentCaption = useMomentCaption(wasmModule, state.slots.find((s) => s.photo)?.photo.bytes);

  // Where the greeting actually sits, and therefore which slot's photo
  // the shared overlay's 'auto' ink should read -- see
  // `messageSlotSample` above.
  const messageBox = geometry && {
    x: state.messagePosition?.x ?? geometry.messageArea.x,
    y: state.messagePosition?.y ?? geometry.messageArea.y,
    w: geometry.messageArea.w,
    h: geometry.messageArea.h,
  };
  const inkSample = messageSlotSample(state.slots, layout, messageBox);

  const allSlotsFilled = state.slots.length > 0 && state.slots.every((s) => s.photo);
  const effFont = effectiveFont(state.fontChoice, state.message);
  const postmarkDate = new Date().toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="editor-layout">
      <PhotoPickerInput inputRef={pickerRef} onPick={onPickedReplacement} />

      {/* Only the frame and its terminal action belong in here. On phones
          `.editor-preview-col` is sticky, so whatever sits in it is pinned
          to the top for the whole session and subtracted from the room the
          controls get to scroll in. Shape and Layout used to live here,
          which pinned ~330px of an 812px viewport on top of the frame's
          own ~206px and left barely 200px of visible controls -- every
          panel below arrived pre-squeezed between the pinned block and the
          Share/Save bar. They're two panels you touch once and then scroll
          past, so they belong in the controls column, which is where the
          single-photo editor has always kept the same two (App.jsx). */}
      <div className="editor-preview-col">
        {/* `--card-ratio` feeds main.css's two height caps on the frame (the
            phone one and the desktop one); without it a collage fell back to
            the `1` default and a portrait card was capped as though it were
            square. PostcardCanvas has always passed it. */}
        <div
          ref={frameRef}
          className="postcard-frame collage-frame"
          style={{ aspectRatio: aspectRatio(aspectId), '--card-ratio': aspectRatio(aspectId) }}
        >
          {state.slots.map((slot, index) => (
            <div
              key={index}
              className={[
                'collage-slot',
                index === state.activeSlotIndex && 'active',
                // An empty slot is a hole in the card, and `.empty` is
                // what lifts it above the shared message/sticker overlay
                // -- see main.css. Without it the greeting was drawn
                // across the "Add photo" labels, two pieces of text on
                // top of each other with neither readable.
                !slot.photo && 'empty',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                left: `${layout.slots[index].area.x * 100}%`,
                top: `${layout.slots[index].area.y * 100}%`,
                width: `${layout.slots[index].area.w * 100}%`,
                height: `${layout.slots[index].area.h * 100}%`,
              }}
              onClick={() => dispatch({ type: 'SET_ACTIVE_SLOT', index })}
            >
              {slot.photo ? (
                <>
                  <CollagePhotoSlot
                    photoUrl={slot.photo.url}
                    naturalW={slot.photo.naturalW}
                    naturalH={slot.photo.naturalH}
                    crop={slot.crop}
                    baseCrop={slot.baseCrop}
                    zoom={slot.zoom}
                    rotation={slot.rotation}
                    bounds={rotatedBounds(
                      wasmModule,
                      slot.photo.naturalW,
                      slot.photo.naturalH,
                      slot.rotation,
                    )}
                    cropMath={slotCropMath(index, slot)}
                    onCropChange={(crop) => dispatch({ type: 'SET_SLOT_CROP', index, crop })}
                    onPinchZoom={(crop, zoom, rotation) =>
                      dispatch({ type: 'SET_SLOT_ZOOM', index, crop, zoom, rotation })
                    }
                    adjustments={slot.adjustments}
                    filter={slot.filter}
                    onDoubleTap={() => requestReplace(index)}
                  />
                  {/* On the selected slot only. Showing it on all of them
                      would put up to three chips over the live preview of
                      the card; following the selection keeps one. It is
                      still seen without hunting, because filling a slot
                      selects it (`openSlotPhoto` dispatches
                      SET_ACTIVE_SLOT) -- so the chip appears on each photo
                      right as it is added, and tapping a photo to change
                      it is the same tap that selects it. A double-tap
                      works on any filled slot regardless, chip or no
                      chip. */}
                  {index === state.activeSlotIndex && (
                    <ReplacePhotoButton onRequest={() => requestReplace(index)} />
                  )}
                </>
              ) : (
                <EmptySlot onPick={(file) => openSlotPhoto(index, file)} />
              )}
            </div>
          ))}

          <PostcardOverlay
            frameRef={frameRef}
            geometry={geometry}
            message={state.message}
            font={effFont}
            fontScale={state.fontScale}
            textColor={state.textColor}
            textAlign={state.textAlign}
            messagePosition={state.messagePosition}
            onMessageMove={(x, y) => dispatch({ type: 'SET_MESSAGE_POSITION', x, y })}
            stickers={state.stickers}
            onStickerMove={(index, x, y) => dispatch({ type: 'MOVE_STICKER', index, x, y })}
            onStickerRemove={(index) => dispatch({ type: 'REMOVE_STICKER', index })}
            photoUrl={inkSample?.slot.photo.url}
            crop={inkSample?.slot.crop}
            photoView={
              inkSample && {
                bounds: rotatedBounds(
                  wasmModule,
                  inkSample.slot.photo.naturalW,
                  inkSample.slot.photo.naturalH,
                  inkSample.slot.rotation,
                ),
                rotation: inkSample.slot.rotation,
              }
            }
            cssFilter={
              inkSample && previewFilterCss(inkSample.slot.adjustments, inkSample.slot.filter)
            }
            autoColorSampleArea={inkSample?.area}
          />
          <DoodleLayer
            strokes={state.strokes}
            drawMode={state.drawMode}
            strokeColor={state.strokeColor}
            strokeWidth={state.strokeWidth}
            onAddStroke={(stroke) => dispatch({ type: 'ADD_STROKE', stroke })}
          />
        </div>

        <div className="editor-preview-actions">
          {/* Back keeps the collage (it's autosaved, and saved again here
              rather than whenever the debounce next fires); Start over
              throws it away. Both land on the intro, which is why having
              only the second one read as "there's no way back". */}
          <button type="button" className="btn ghost" onClick={backToIntro}>
            <BackIcon />
            {t('editor.back')}
          </button>
          {/* Tells App whether there is anything to lose, so an empty
              collage leaves without a confirmation nobody needs. */}
          <button type="button" className="btn ghost" onClick={() => onExit(anySlotFilled)}>
            {t('intro.startOver')}
          </button>
        </div>
      </div>

      <div className="editor-controls-col">
        {/* Shape then Layout, the same order and the same column as the
            single-photo editor's TemplatePicker + LayoutPanel. */}
        <TemplatePicker aspectId={aspectId} onChange={setAspectId} />

        {/* The layouts are generated, not a fixed menu -- Shuffle deals
            six more (two each of 2, 3 and 4 photos). The row always
            includes whichever one the card is currently using, even
            after a shuffle has moved on from it, so there is always
            exactly one swatch highlighted. */}
        <div className="panel">
          <div className="panel-head">
            <h2>{t('collage.layout')}</h2>
            <button type="button" className="btn outline" onClick={shuffleLayouts}>
              <DiceIcon />
              {t('collage.shuffle')}
            </button>
          </div>
          <div className="collage-layout-options" key={deals}>
            {withSelected(layouts, layout).map((l) => {
              const active = l.id === state.layoutId;
              return (
                <button
                  key={l.id}
                  type="button"
                  className={active ? 'collage-layout-swatch active' : 'collage-layout-swatch'}
                  aria-pressed={active}
                  aria-label={t('collage.layoutOf').replace('{n}', l.slots.length)}
                  onClick={() => selectLayout(l)}
                >
                  <span
                    className="collage-layout-preview"
                    style={{ aspectRatio: aspectRatio(aspectId) }}
                  >
                    {l.slots.map((s, i) => (
                      <span
                        key={i}
                        style={{
                          left: `${s.area.x * 100}%`,
                          top: `${s.area.y * 100}%`,
                          width: `${s.area.w * 100}%`,
                          height: `${s.area.h * 100}%`,
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-option-note">{t('collage.layoutHint')}</p>
        </div>

        {activeSlot?.photo && (
          <FilterPanel
            zoom={activeSlot.zoom}
            minZoom={activeMinZoom()}
            rotation={activeSlot.rotation}
            onRotationChange={rotateActiveSlot}
            onZoomChange={changeActiveZoom}
            filter={activeSlot.filter}
            onFilterChange={(f) =>
              dispatch({ type: 'SET_SLOT_FILTER', index: state.activeSlotIndex, filter: f })
            }
            adjustments={activeSlot.adjustments}
            onAdjustmentsChange={(a) =>
              dispatch({
                type: 'SET_SLOT_ADJUSTMENTS',
                index: state.activeSlotIndex,
                adjustments: a,
              })
            }
            onReset={() =>
              dispatch({ type: 'RESET_SLOT_ADJUSTMENTS', index: state.activeSlotIndex })
            }
          />
        )}

        <TextPanel
          message={state.message}
          onMessageChange={(m) => dispatch({ type: 'SET_MESSAGE', message: m })}
          suggestion={momentCaption}
          font={state.fontChoice}
          onFontChange={(f) => dispatch({ type: 'SET_FONT_CHOICE', fontChoice: f })}
          fontScale={state.fontScale}
          onFontScaleChange={(s) => dispatch({ type: 'SET_FONT_SCALE', fontScale: s })}
          textColor={state.textColor}
          onTextColorChange={(c) => dispatch({ type: 'SET_TEXT_COLOR', textColor: c })}
          textAlign={state.textAlign}
          onTextAlignChange={(a) => dispatch({ type: 'SET_TEXT_ALIGN', textAlign: a })}
        />
        <div className="panel">
          <h2>{t('stickers.heading')}</h2>
          <StickerPalette onAdd={addSticker} />
        </div>
        <DoodleToolbar
          drawMode={state.drawMode}
          onToggleDrawMode={() => dispatch({ type: 'SET_DRAW_MODE', drawMode: !state.drawMode })}
          strokeColor={state.strokeColor}
          onStrokeColorChange={(c) => dispatch({ type: 'SET_STROKE_COLOR', color: c })}
          strokeWidth={state.strokeWidth}
          onStrokeWidthChange={(w) => dispatch({ type: 'SET_STROKE_WIDTH', width: w })}
          hasStrokes={state.strokes.length > 0}
          onUndo={() => dispatch({ type: 'UNDO_STROKE' })}
          onClear={() => dispatch({ type: 'CLEAR_STROKES' })}
        />
        <BackSidePanel
          enabled={state.backSide.enabled}
          onToggle={toggleBackSide}
          location={state.backSide.location}
          onLocationChange={(location) => dispatch({ type: 'SET_BACK_SIDE_LOCATION', location })}
          address={state.backSide.address}
          onAddressChange={(address) => dispatch({ type: 'SET_BACK_SIDE_ADDRESS', address })}
        />

        {!allSlotsFilled && <p className="text-option-note">{t('collage.fillAllSlots')}</p>}

        {allSlotsFilled && (
          <div className="finish-panel">
            <ShareBar
              renderFront={() =>
                renderCollage({
                  wasmModule,
                  aspectRatio: aspectRatio(aspectId),
                  slots: state.slots.map((s, i) => ({
                    photoBytes: s.photo.bytes,
                    crop: s.crop,
                    rotation: s.rotation,
                    photoFit: photoFit(s.crop, s.baseCrop, s.zoom),
                    adjustments: s.adjustments,
                    filter: s.filter,
                    area: layout.slots[i].area,
                  })),
                  message: state.message,
                  font: effFont,
                  fontScale: state.fontScale,
                  textColor: state.textColor,
                  textAlign: state.textAlign,
                  messagePosition: state.messagePosition,
                  stickers: state.stickers,
                  strokes: state.strokes,
                  geometry,
                })
              }
              backSide={
                state.backSide.enabled
                  ? {
                      enabled: true,
                      aspectRatio: aspectRatio(aspectId),
                      message: state.message,
                      font: effFont,
                      fontScale: state.fontScale,
                      textColor: state.textColor,
                      location: state.backSide.location,
                      address: state.backSide.address,
                      date: postmarkDate,
                      toLabel: t('backSide.to'),
                    }
                  : null
              }
              onError={onError}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The empty slot's own picker -- still a `<label>` wrapping its input,
 * because here the whole slot is the target and there is no photo
 * underneath to protect from the tap.
 */
function EmptySlot({ onPick }) {
  const { t } = useI18n();
  const onChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPick(file);
  };
  return (
    <label className="collage-empty-slot">
      <ImageIcon />
      <span>{t('collage.addPhoto')}</span>
      <input type="file" accept="image/*" onChange={onChange} className="visually-hidden" />
    </label>
  );
}
