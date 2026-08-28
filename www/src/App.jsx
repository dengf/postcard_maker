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
import CaptionPanel from './components/CaptionPanel';
import DoodleToolbar from './components/DoodleToolbar';
import BackSidePanel from './components/BackSidePanel';
import CollageEditor from './components/CollageEditor';
import { useConfirm } from './components/ConfirmDialog';
import { ASPECTS, aspectRatio } from './aspect';
import { zoomedCrop } from './cropGesture';
import { effectiveFont } from './fonts';
import { saveDraft, loadDraft, clearDraft } from './draftStore';
import { detectLocation } from './location';
import { renderPostcard } from './export';
import { postcardReducer, initialState, DEFAULT_ADJUSTMENTS, nextStickerKey } from './postcardReducer';

const DEFAULT_ASPECT = ASPECTS[0].id;
const AUTOSAVE_DELAY_MS = 800;

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

  const [state, dispatch] = useReducer(postcardReducer, DEFAULT_ASPECT, initialState);
  const [error, setError] = useState(null);
  const [draftAvailable, setDraftAvailable] = useState(false);

  const objectUrlRef = useRef(null);
  const { photo, aspectId, baseCrop, crop, zoom, geometry, adjustments, filter } = state;
  const { message, fontChoice, fontScale, textColor, textAlign, stickers, strokes, drawMode } = state;
  const { strokeColor, strokeWidth, backSide } = state;

  // A previously unfinished postcard, offered once at startup rather than
  // silently resumed -- someone landing fresh (a shared link, a second
  // visit that isn't a continuation) shouldn't have yesterday's photo
  // reappear without asking. Collage drafts aren't persisted in v1 -- a
  // scope cut, not an oversight, see CLAUDE.md.
  useEffect(() => {
    if (wasmModule?.unavailable) return;
    loadDraft()
      .then((draft) => setDraftAvailable(!!draft))
      .catch(() => {});
  }, [wasmModule]);

  const openPhoto = useCallback(
    async (file, restored) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = URL.createObjectURL(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      try {
        const { w, h } = await loadImageDimensions(url);
        const aspect = restored?.aspectId ?? DEFAULT_ASPECT;
        const base = wasmModule.suggest_crop(w, h, aspect);
        const geo = wasmModule.template_geometry(aspect);

        dispatch({
          type: 'OPEN_PHOTO',
          photo: { bytes, url, naturalW: w, naturalH: h, mimeType: file.type || 'image/jpeg' },
          aspect,
          base,
          geometry: geo,
          restored,
        });
      } catch (err) {
        setError(err);
      }
    },
    [wasmModule],
  );

  const resumeDraft = useCallback(async () => {
    setDraftAvailable(false);
    const draft = await loadDraft();
    if (!draft) return;
    await openPhoto(new File([draft.photoBlob], 'postcard.jpg', { type: draft.photoBlob.type }), draft);
  }, [openPhoto]);

  const discardDraft = useCallback(() => {
    setDraftAvailable(false);
    clearDraft().catch(() => {});
  }, []);

  const changeAspect = useCallback(
    (nextAspect) => {
      if (!photo) return;
      const base = wasmModule.suggest_crop(photo.naturalW, photo.naturalH, nextAspect);
      dispatch({ type: 'CHANGE_ASPECT', aspect: nextAspect, base, geometry: wasmModule.template_geometry(nextAspect) });
    },
    [photo, wasmModule],
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

  const applyVibe = useCallback((vibeFilter, stickerId, adjustments) => {
    dispatch({
      type: 'APPLY_VIBE',
      filter: vibeFilter,
      stickerId,
      adjustments,
      key: stickerId ? nextStickerKey() : undefined,
    });
  }, []);

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
    discardDraft();
  }, [confirm, t, discardDraft]);

  // Autosaves the in-progress postcard, debounced so a slider drag or a
  // keystroke doesn't open an IndexedDB write per frame.
  useEffect(() => {
    if (!photo) return;
    const handle = setTimeout(() => {
      saveDraft({
        photoBlob: new Blob([photo.bytes], { type: photo.mimeType }),
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
        stickers,
        strokes,
        backSide,
      }).catch(() => {});
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [photo, aspectId, crop, zoom, adjustments, filter, message, fontChoice, fontScale, textColor, textAlign, stickers, strokes, backSide]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
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
        {draftAvailable && (
          <div className="panel">
            <p>{t('draft.restoredPrompt')}</p>
            <div className="share-actions">
              <button type="button" className="btn" onClick={resumeDraft}>
                {t('draft.resume')}
              </button>
              <button type="button" className="btn secondary" onClick={discardDraft}>
                {t('draft.discard')}
              </button>
            </div>
          </div>
        )}

        {!photo && !collageActive && (
          <Intro onPhotoFile={openPhoto} onStartCollage={() => setCollageActive(true)} />
        )}

        {collageActive && (
          <CollageEditor wasmModule={wasmModule} onError={setError} onExit={() => setCollageActive(false)} />
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
                message={message}
                font={effFont}
                fontScale={fontScale}
                textColor={textColor}
                textAlign={textAlign}
                stickers={stickers}
                onStickerMove={(index, x, y) => dispatch({ type: 'MOVE_STICKER', index, x, y })}
                onStickerRemove={(index) => dispatch({ type: 'REMOVE_STICKER', index })}
                strokes={strokes}
                drawMode={drawMode}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                onAddStroke={(stroke) => dispatch({ type: 'ADD_STROKE', stroke })}
              />
              <button type="button" className="btn ghost" onClick={startOver}>
                {t('intro.startOver')}
              </button>
            </div>

            <div className="editor-controls-col">
              <TemplatePicker aspectId={aspectId} onChange={changeAspect} />
              <FilterPanel
                zoom={zoom}
                onZoomChange={changeZoom}
                filter={filter}
                onFilterChange={(f) => dispatch({ type: 'SET_FILTER', filter: f })}
                adjustments={adjustments}
                onAdjustmentsChange={(a) => dispatch({ type: 'SET_ADJUSTMENTS', adjustments: a })}
                onReset={() => dispatch({ type: 'RESET_ADJUSTMENTS' })}
              />
              <VibePanel
                photoBytes={photo.bytes}
                onApply={applyVibe}
                onSetMessage={(m) => dispatch({ type: 'SET_MESSAGE', message: m })}
                onError={setError}
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
              <CaptionPanel
                photoBytes={photo.bytes}
                onSetMessage={(m) => dispatch({ type: 'SET_MESSAGE', message: m })}
                onError={setError}
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
              />
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
                    stickers,
                    strokes,
                    geometry,
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
                        date: postmarkDate,
                      }
                    : null
                }
                onError={setError}
              />
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
