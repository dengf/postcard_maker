import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { I18nProvider, useI18n, detectLocale } from './i18n';
import Header from './components/Header';
import UpdateBanner from './components/UpdateBanner';
import ErrorToast from './components/ErrorToast';
import Intro from './components/Intro';
import TemplatePicker from './components/TemplatePicker';
import FilterPanel from './components/FilterPanel';
import TextPanel from './components/TextPanel';
import StickerPalette from './components/StickerPalette';
import PostcardCanvas from './components/PostcardCanvas';
import ShareBar from './components/ShareBar';
import VibePanel from './components/VibePanel';
import DoodleToolbar from './components/DoodleToolbar';
import BackSidePanel from './components/BackSidePanel';
import CollageEditor from './components/CollageEditor';
import { PhotoPickerInput } from './components/ReplacePhotoButton';
import { BackIcon } from './components/icons';
import { useConfirm } from './components/ConfirmDialog';
import { ASPECTS, aspectRatio } from './aspect';
import { zoomedCrop } from './cropGesture';
import { effectiveFont } from './fonts';
import { unreadablePhotoError } from './photoFormat';
import { saveDraft, loadDraft, clearDraft, draftThumbBlob, isCollageDraft } from './draftStore';
import { detectLocation } from './location';
import { renderPostcard } from './export';
import { postcardReducer, initialState, DEFAULT_ADJUSTMENTS, nextStickerKey } from './postcardReducer';
import { templateGeometry, suggestCropForLayout } from './photoLayout';
import LayoutPanel from './components/LayoutPanel';

const DEFAULT_ASPECT = ASPECTS[0].id;
const AUTOSAVE_DELAY_MS = 800;

/**
 * The record `draftStore` keeps for a single-photo card. Named rather
 * than built inline in the autosave effect because Back saves the same
 * thing on the spot, without waiting out the debounce -- leaving the
 * editor must not cost you the last thing you typed.
 *
 * No `kind` field: this is the shape the store has always written, and
 * `isCollageDraft` reads its absence as "a postcard". See `draftStore.js`.
 */
function postcardDraft(state) {
  return {
    photoBlob: new Blob([state.photo.bytes], { type: state.photo.mimeType }),
    aspectId: state.aspectId,
    crop: state.crop,
    zoom: state.zoom,
    adjustments: state.adjustments,
    filter: state.filter,
    message: state.message,
    fontChoice: state.fontChoice,
    fontScale: state.fontScale,
    textColor: state.textColor,
    textAlign: state.textAlign,
    // `OPEN_PHOTO` has always restored this and the autosave never wrote
    // it, so a greeting someone dragged off centre came back centred.
    messagePosition: state.messagePosition,
    stickers: state.stickers,
    strokes: state.strokes,
    backSide: state.backSide,
    photoCoverage: state.photoCoverage,
    photoSide: state.photoSide,
    fillStyle: state.fillStyle,
    fillColor: state.fillColor,
  };
}

function loadImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`could not read dimensions for ${url}`));
    img.src = url;
  });
}

function AppShell({ wasmModule }) {
  const { t, locale } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const [collageActive, setCollageActive] = useState(false);
  // The collage draft being resumed, handed to `CollageEditor` once. Null
  // whenever a collage is started fresh from the intro.
  const [collageDraft, setCollageDraft] = useState(null);

  const [state, dispatch] = useReducer(postcardReducer, DEFAULT_ASPECT, initialState);
  const [error, setError] = useState(null);
  // `null` when there's nothing to resume; otherwise the draft's own photo
  // as an object URL plus when it was last touched, so the banner can show
  // *which* postcard it means -- see the comment on the loader below.
  const [draftPreview, setDraftPreview] = useState(null);

  const objectUrlRef = useRef(null);
  const draftPreviewUrlRef = useRef(null);
  const pickerRef = useRef(null);
  const { photo, aspectId, baseCrop, crop, zoom, geometry, adjustments, filter } = state;
  const { message, fontChoice, fontScale, textColor, textAlign, messagePosition, stickers, strokes, drawMode } = state;
  const { strokeColor, strokeWidth, backSide, photoCoverage, photoSide, fillStyle, fillColor } = state;

  // A previously unfinished card, of either kind, offered once at startup
  // rather than silently resumed -- someone landing fresh (a shared link,
  // a second visit that isn't a continuation) shouldn't have yesterday's
  // photo reappear without asking.
  //
  // The photo comes back as an object URL for the banner's thumbnail: the
  // blob is already read here to decide whether to offer resuming at all,
  // so showing it costs one `createObjectURL` and answers the question the
  // prompt used to leave open -- *which* unfinished postcard? A day later
  // the sentence alone doesn't tell you, and Discard is right next to it.
  //
  // Reusable because the intro is reachable again: Back leaves an editor
  // without discarding anything, and the card someone just stepped away
  // from is exactly what the banner should be offering when they land.
  const showDraftBanner = useCallback(async () => {
    const draft = await loadDraft().catch(() => null);
    const blob = draftThumbBlob(draft);
    if (!blob) return;
    if (draftPreviewUrlRef.current) URL.revokeObjectURL(draftPreviewUrlRef.current);
    const url = URL.createObjectURL(blob);
    draftPreviewUrlRef.current = url;
    setDraftPreview({ url, updatedAt: draft.updatedAt ?? null, collage: isCollageDraft(draft) });
  }, []);

  useEffect(() => {
    if (wasmModule?.unavailable) return;
    showDraftBanner();
  }, [wasmModule, showDraftBanner]);

  // Drops the banner and its thumbnail without touching what's stored --
  // used whenever the banner stops being relevant (resumed, discarded, or
  // superseded by a fresh photo).
  const releaseDraftPreview = useCallback(() => {
    if (draftPreviewUrlRef.current) {
      URL.revokeObjectURL(draftPreviewUrlRef.current);
      draftPreviewUrlRef.current = null;
    }
    setDraftPreview(null);
  }, []);

  const openPhoto = useCallback(
    async (file, restored) => {
      // Whatever the banner was offering is moot now -- autosave is about
      // to overwrite that draft with this photo, so leaving the old
      // thumbnail on screen would advertise something that no longer
      // exists. (`resumeDraft` has already released it by this point.)
      releaseDraftPreview();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = URL.createObjectURL(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      try {
        const { w, h } = await loadImageDimensions(url);
        const aspect = restored?.aspectId ?? DEFAULT_ASPECT;
        const coverage = restored?.photoCoverage ?? 'full';
        const side = restored?.photoSide ?? 'first';
        const geo = templateGeometry(wasmModule, aspect, coverage, side);
        const base = suggestCropForLayout(wasmModule, w, h, aspect, coverage, geo.photoArea, aspectRatio(aspect));

        dispatch({
          type: 'OPEN_PHOTO',
          photo: { bytes, url, naturalW: w, naturalH: h, mimeType: file.type || 'image/jpeg' },
          aspect,
          base,
          geometry: geo,
          restored,
        });
      } catch (err) {
        // A coded failure came from the wasm boundary and already knows how
        // to describe itself. An uncoded one at this point is
        // `loadImageDimensions` rejecting, which means the browser's own
        // decoder refused the file -- overwhelmingly HEIC from an iPhone,
        // so say so instead of surfacing "could not read dimensions for
        // blob:...", which named a URL the user has never seen.
        setError(err?.code ? err : unreadablePhotoError(file));
      }
    },
    [wasmModule, releaseDraftPreview],
  );

  /**
   * A different photo on the card in progress, from the chip on the
   * preview or a double-tap on it. Deliberately not `openPhoto`: that
   * one starts a new card (see `REPLACE_PHOTO` in `postcardReducer`),
   * and the only way to change your mind about a photo used to be Start
   * over, which asks to throw the whole card away.
   *
   * The old object URL is revoked only once the new photo is actually
   * in, so a file the browser can't decode leaves the card showing the
   * photo it had rather than a broken image. (`openPhoto` revokes up
   * front, which is fine there -- nothing is on screen yet to break.)
   */
  const replacePhoto = useCallback(
    async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = URL.createObjectURL(file);
      try {
        const { w, h } = await loadImageDimensions(url);
        const base = suggestCropForLayout(
          wasmModule,
          w,
          h,
          state.aspectId,
          state.photoCoverage,
          state.geometry.photoArea,
          aspectRatio(state.aspectId),
        );
        dispatch({
          type: 'REPLACE_PHOTO',
          photo: { bytes, url, naturalW: w, naturalH: h, mimeType: file.type || 'image/jpeg' },
          base,
        });
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
      } catch (err) {
        URL.revokeObjectURL(url);
        setError(err?.code ? err : unreadablePhotoError(file));
      }
    },
    [wasmModule, state.aspectId, state.photoCoverage, state.geometry],
  );

  const resumeDraft = useCallback(async () => {
    releaseDraftPreview();
    const draft = await loadDraft();
    if (!draft) return;
    // A collage rebuilds itself from the record -- it owns the layout and
    // slot geometry needed to turn stored blobs back into photos, which
    // this component knows nothing about.
    if (isCollageDraft(draft)) {
      setCollageDraft(draft);
      setCollageActive(true);
      return;
    }
    await openPhoto(new File([draft.photoBlob], 'postcard.jpg', { type: draft.photoBlob.type }), draft);
  }, [openPhoto, releaseDraftPreview]);

  // Deletes the stored draft outright, no prompt -- for callers that have
  // already asked (`startOver`), so the user isn't made to confirm twice
  // for one decision.
  const forgetDraft = useCallback(() => {
    releaseDraftPreview();
    clearDraft().catch(() => {});
  }, [releaseDraftPreview]);

  // The banner's own Discard *does* ask. It sits one thumb-width from
  // Resume on the screen someone lands on before they've oriented
  // themselves, and it's unrecoverable -- the same loss `startOver` has
  // always confirmed, so it gets the same guard.
  const discardDraft = useCallback(async () => {
    const ok = await confirm(t('confirm.discardDraftBody'), t('confirm.discardDraft'));
    if (!ok) return;
    forgetDraft();
  }, [confirm, t, forgetDraft]);

  const changeAspect = useCallback(
    (nextAspect) => {
      if (!photo) return;
      const geo = templateGeometry(wasmModule, nextAspect, photoCoverage, photoSide);
      const base = suggestCropForLayout(
        wasmModule,
        photo.naturalW,
        photo.naturalH,
        nextAspect,
        photoCoverage,
        geo.photoArea,
        aspectRatio(nextAspect),
      );
      dispatch({ type: 'CHANGE_ASPECT', aspect: nextAspect, base, geometry: geo });
    },
    [photo, wasmModule, photoCoverage, photoSide],
  );

  // Changing how much of the card the photo covers (and which side) needs
  // the same "recompute geometry, re-suggest the crop" dance `changeAspect`
  // already does -- the photo box's own on-card pixel ratio changed, so
  // the previous crop no longer targets the right shape.
  const changeLayout = useCallback(
    (coverage, side) => {
      if (!photo) return;
      const geo = templateGeometry(wasmModule, aspectId, coverage, side);
      const base = suggestCropForLayout(
        wasmModule,
        photo.naturalW,
        photo.naturalH,
        aspectId,
        coverage,
        geo.photoArea,
        aspectRatio(aspectId),
      );
      dispatch({ type: 'SET_LAYOUT', coverage, side, base, geometry: geo });
    },
    [photo, wasmModule, aspectId],
  );

  const changeZoom = useCallback(
    (nextZoom) => {
      if (!photo || !baseCrop) return;
      dispatch({ type: 'CHANGE_ZOOM', crop: zoomedCrop(crop, baseCrop, photo.naturalW, photo.naturalH, nextZoom), zoom: nextZoom });
    },
    [photo, baseCrop, crop],
  );

  const addSticker = useCallback(
    (id) => {
      const n = state.stickers.length;
      dispatch({
        type: 'ADD_STICKER',
        id,
        key: nextStickerKey(),
        x: 0.5 + ((n % 3) - 1) * 0.1,
        y: 0.5 + ((n % 2) - 0.5) * 0.14,
      });
    },
    [state.stickers.length],
  );

  // A "Suggest a look" candidate carries a full look, not just a filter --
  // when it also names a `photoCoverage` different from the current one,
  // that's the same "template geometry changed" event `changeLayout`
  // handles manually, so this does the same wasm recompute first and
  // folds the result into one `APPLY_VIBE` dispatch alongside everything
  // else the candidate specifies.
  const applyVibe = useCallback(
    (candidate) => {
      let layout = null;
      if (candidate.photoCoverage && photo) {
        const side = candidate.photoSide ?? 'first';
        if (candidate.photoCoverage !== photoCoverage || side !== photoSide) {
          const geo = templateGeometry(wasmModule, aspectId, candidate.photoCoverage, side);
          const base = suggestCropForLayout(
            wasmModule,
            photo.naturalW,
            photo.naturalH,
            aspectId,
            candidate.photoCoverage,
            geo.photoArea,
            aspectRatio(aspectId),
          );
          layout = { coverage: candidate.photoCoverage, side, base, geometry: geo };
        }
      }
      dispatch({
        type: 'APPLY_VIBE',
        filter: candidate.filter,
        stickerId: candidate.sticker,
        adjustments: candidate.adjustments,
        key: candidate.sticker ? nextStickerKey() : undefined,
        fontChoice: candidate.fontChoice,
        fontScale: candidate.fontScale,
        textColor: candidate.textColor,
        fillStyle: candidate.fillStyle,
        fillColor: candidate.fillColor,
        layout,
      });
    },
    [photo, wasmModule, aspectId, photoCoverage, photoSide],
  );

  // Pre-fills a best-guess location (timezone-derived, zero permission --
  // see location.js) the first time the back side is switched on, only
  // if nothing's been typed there yet. Never overwrites an existing
  // value, including an intentionally-cleared one.
  const toggleBackSide = useCallback(
    (enabled) => {
      dispatch({ type: 'SET_BACK_SIDE_ENABLED', enabled });
      if (enabled && !backSide.location) {
        const guess = detectLocation();
        if (guess) dispatch({ type: 'SET_BACK_SIDE_LOCATION', location: guess });
      }
    },
    [backSide.location],
  );

  const startOver = useCallback(async () => {
    const ok = await confirm(t('confirm.startOverBody'), t('confirm.confirm'));
    if (!ok) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    dispatch({ type: 'RESET', defaultAspect: DEFAULT_ASPECT });
    forgetDraft();
  }, [confirm, t, forgetDraft]);

  /**
   * Back out of the single-photo editor to the intro. Not "Start over":
   * nothing is discarded, the card is saved on the way out (rather than
   * whenever the debounce next fires), and the banner on the intro is
   * left offering it again.
   *
   * Until this existed the only control that reached the intro was Start
   * over, which asks to throw the card away to get there -- so "go back
   * and look at the front page" meant either losing your work or using
   * the browser's own Back button.
   */
  const backToIntro = useCallback(async () => {
    if (photo) await saveDraft(postcardDraft(state)).catch(() => {});
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    dispatch({ type: 'RESET', defaultAspect: DEFAULT_ASPECT });
    showDraftBanner();
  }, [photo, state, showDraftBanner]);

  /** The collage's own Back. The editor has already saved itself. */
  const backFromCollage = useCallback(() => {
    setCollageDraft(null);
    setCollageActive(false);
    showDraftBanner();
  }, [showDraftBanner]);

  /**
   * Leaving the collage editor by its own Start over. It asks first and
   * then forgets the saved collage: the point of "Start over" is that
   * there's nothing left to come back to, and a draft that outlived it
   * would reappear in the banner on the next visit as a card the user
   * had already thrown away.
   *
   * An empty collage skips the question -- there is nothing to lose, and
   * `CollageEditor` is the one that knows.
   */
  const exitCollage = useCallback(
    async (hasPhotos) => {
      if (hasPhotos) {
        const ok = await confirm(t('confirm.startOverCollageBody'), t('confirm.confirm'));
        if (!ok) return;
        forgetDraft();
      }
      setCollageDraft(null);
      setCollageActive(false);
    },
    [confirm, t, forgetDraft],
  );

  // A one-tap jump to the Share/Save panel -- it's the last thing in a
  // long single-column control stack on phones, and desktop has no
  // sticky bottom bar shortcut to it the way mobile does (see
  // .share-sticky-bar in main.css), so this gives both layouts a
  // persistent way to reach it from right under the preview.
  const scrollToFinish = useCallback(() => {
    document.getElementById('finish-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Autosaves the in-progress postcard, debounced so a slider drag or a
  // keystroke doesn't open an IndexedDB write per frame.
  useEffect(() => {
    if (!photo) return;
    const handle = setTimeout(() => {
      saveDraft(postcardDraft(state)).catch(() => {});
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the saved
    // fields are the real dependency, not every field `state` carries
    // (drawMode and the stroke tools aren't part of the card).
  }, [
    photo,
    aspectId,
    crop,
    zoom,
    adjustments,
    filter,
    message,
    fontChoice,
    fontScale,
    textColor,
    textAlign,
    messagePosition,
    stickers,
    strokes,
    backSide,
    photoCoverage,
    photoSide,
    fillStyle,
    fillColor,
  ]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    if (draftPreviewUrlRef.current) URL.revokeObjectURL(draftPreviewUrlRef.current);
  }, []);

  if (wasmModule?.unavailable) {
    return (
      <div className="app">
        <Header />
        <main className="app-main">
          <div className="error">{t('errors.engineUnavailable')}</div>
        </main>
      </div>
    );
  }

  const effFont = effectiveFont(fontChoice, message);
  const postmarkDate = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        {draftPreview && (
          <div className="panel draft-banner">
            <img
              className="draft-thumb"
              src={draftPreview.url}
              alt={t(draftPreview.collage ? 'draft.previewAltCollage' : 'draft.previewAlt')}
            />
            <div className="draft-banner-body">
              <p className="draft-banner-prompt">
                {t(draftPreview.collage ? 'draft.restoredCollagePrompt' : 'draft.restoredPrompt')}
              </p>
              {draftPreview.updatedAt && (
                <p className="draft-banner-meta">
                  {t('draft.lastEdited', {
                    date: new Date(draftPreview.updatedAt).toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    }),
                  })}
                </p>
              )}
              <div className="share-actions">
                <button type="button" className="btn" onClick={resumeDraft}>
                  {t('draft.resume')}
                </button>
                <button type="button" className="btn secondary" onClick={discardDraft}>
                  {t('draft.discard')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!photo && !collageActive && (
          <Intro
            onPhotoFile={openPhoto}
            onStartCollage={() => {
              // Same reasoning as `openPhoto`'s own call: the banner is
              // offering a card this collage's first photo is about to
              // overwrite, so it stops being something to advertise.
              releaseDraftPreview();
              setCollageDraft(null);
              setCollageActive(true);
            }}
          />
        )}

        {collageActive && (
          <CollageEditor
            wasmModule={wasmModule}
            onError={setError}
            onExit={exitCollage}
            onBack={backFromCollage}
            draft={collageDraft}
          />
        )}

        {photo && crop && (
          <div className="editor-layout">
            <div className="editor-preview-col">
              <PostcardCanvas
                photoUrl={photo.url}
                naturalW={photo.naturalW}
                naturalH={photo.naturalH}
                crop={crop}
                onCropChange={(next) => dispatch({ type: 'SET_CROP', crop: next })}
                aspectRatio={aspectRatio(aspectId)}
                adjustments={adjustments}
                filter={filter}
                geometry={geometry}
                fillStyle={fillStyle}
                fillColor={fillColor}
                message={message}
                font={effFont}
                fontScale={fontScale}
                textColor={textColor}
                textAlign={textAlign}
                messagePosition={messagePosition}
                onMessageMove={(x, y) => dispatch({ type: 'SET_MESSAGE_POSITION', x, y })}
                address={backSide.address}
                stickers={stickers}
                onStickerMove={(index, x, y) => dispatch({ type: 'MOVE_STICKER', index, x, y })}
                onStickerRemove={(index) => dispatch({ type: 'REMOVE_STICKER', index })}
                strokes={strokes}
                drawMode={drawMode}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                onAddStroke={(stroke) => dispatch({ type: 'ADD_STROKE', stroke })}
                onReplacePhoto={() => pickerRef.current?.click()}
              />
              <PhotoPickerInput inputRef={pickerRef} onPick={replacePhoto} />
              <div className="editor-preview-actions">
                <button type="button" className="btn ghost" onClick={backToIntro}>
                  <BackIcon />
                  {t('editor.back')}
                </button>
                <button type="button" className="btn ghost" onClick={startOver}>
                  {t('intro.startOver')}
                </button>
                {/* Hidden on phones by CSS, not dropped from the DOM: the
                    sticky Share/Save bar is already on screen there at
                    every scroll position, so this would only scroll to a
                    panel whose buttons that bar has taken over. */}
                <button type="button" className="btn ghost finish-jump" onClick={scrollToFinish}>
                  {t('share.heading')}
                </button>
              </div>
            </div>

            <div className="editor-controls-col">
              <VibePanel
                photoBytes={photo.bytes}
                onApply={applyVibe}
                onSetMessage={(m) => dispatch({ type: 'SET_MESSAGE', message: m })}
                onError={setError}
              />
              <TemplatePicker aspectId={aspectId} onChange={changeAspect} />
              <LayoutPanel
                aspectId={aspectId}
                coverage={photoCoverage}
                side={photoSide}
                onChangeLayout={changeLayout}
                fillStyle={fillStyle}
                onFillStyleChange={(f) => dispatch({ type: 'SET_FILL_STYLE', fillStyle: f })}
                fillColor={fillColor}
                onFillColorChange={(c) => dispatch({ type: 'SET_FILL_COLOR', fillColor: c })}
              />
              <FilterPanel
                zoom={zoom}
                onZoomChange={changeZoom}
                filter={filter}
                onFilterChange={(f) => dispatch({ type: 'SET_FILTER', filter: f })}
                adjustments={adjustments}
                onAdjustmentsChange={(a) => dispatch({ type: 'SET_ADJUSTMENTS', adjustments: a })}
                onReset={() => dispatch({ type: 'RESET_ADJUSTMENTS' })}
              />
              <TextPanel
                message={message}
                onMessageChange={(m) => dispatch({ type: 'SET_MESSAGE', message: m })}
                font={fontChoice}
                onFontChange={(f) => dispatch({ type: 'SET_FONT_CHOICE', fontChoice: f })}
                fontScale={fontScale}
                onFontScaleChange={(s) => dispatch({ type: 'SET_FONT_SCALE', fontScale: s })}
                textColor={textColor}
                onTextColorChange={(c) => dispatch({ type: 'SET_TEXT_COLOR', textColor: c })}
                textAlign={textAlign}
                onTextAlignChange={(a) => dispatch({ type: 'SET_TEXT_ALIGN', textAlign: a })}
              />
              <div className="panel">
                <h2>{t('stickers.heading')}</h2>
                <StickerPalette onAdd={addSticker} />
              </div>
              <DoodleToolbar
                drawMode={drawMode}
                onToggleDrawMode={() => dispatch({ type: 'SET_DRAW_MODE', drawMode: !drawMode })}
                strokeColor={strokeColor}
                onStrokeColorChange={(c) => dispatch({ type: 'SET_STROKE_COLOR', color: c })}
                strokeWidth={strokeWidth}
                onStrokeWidthChange={(w) => dispatch({ type: 'SET_STROKE_WIDTH', width: w })}
                hasStrokes={strokes.length > 0}
                onUndo={() => dispatch({ type: 'UNDO_STROKE' })}
                onClear={() => dispatch({ type: 'CLEAR_STROKES' })}
              />
              <BackSidePanel
                enabled={backSide.enabled}
                onToggle={toggleBackSide}
                location={backSide.location}
                onLocationChange={(location) => dispatch({ type: 'SET_BACK_SIDE_LOCATION', location })}
                address={backSide.address}
                onAddressChange={(address) => dispatch({ type: 'SET_BACK_SIDE_ADDRESS', address })}
              />
              {/* The id is the scroll anchor for the Finish shortcut; the
                  class is what the phone layout's chrome collapse keys
                  off, so the collage editor can share it. */}
              <div id="finish-panel" className="finish-panel">
                <ShareBar
                  renderFront={() =>
                    renderPostcard({
                      wasmModule,
                      photoBytes: photo.bytes,
                      crop,
                      adjustments,
                      filter,
                      message,
                      font: effFont,
                      fontScale,
                      textColor,
                      textAlign,
                      messagePosition,
                      stickers,
                      strokes,
                      geometry,
                      fillStyle,
                      fillColor,
                      address: backSide.address,
                      toLabel: t('backSide.to'),
                    })
                  }
                  backSide={
                    backSide.enabled
                      ? {
                          enabled: true,
                          aspectRatio: aspectRatio(aspectId),
                          message,
                          font: effFont,
                          fontScale,
                          textColor,
                          location: backSide.location,
                          address: backSide.address,
                          date: postmarkDate,
                          toLabel: t('backSide.to'),
                        }
                      : null
                  }
                  onError={setError}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <ErrorToast error={error} />
      <UpdateBanner />
      {confirmDialog}
    </div>
  );
}

export default function App({ wasmModule }) {
  return (
    <I18nProvider initialLocale={detectLocale()}>
      <AppShell wasmModule={wasmModule} />
    </I18nProvider>
  );
}
