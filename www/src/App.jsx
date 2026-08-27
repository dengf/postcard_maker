import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useConfirm } from './components/ConfirmDialog';
import { ASPECTS, aspectRatio } from './aspect';
import { zoomedCrop } from './cropGesture';
import { effectiveFont } from './fonts';
import { saveDraft, loadDraft, clearDraft } from './draftStore';

const DEFAULT_ADJUSTMENTS = { brightness: 0, contrast: 1, saturation: 1 };
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
  const { t } = useI18n();
  const [confirm, confirmDialog] = useConfirm();

  const [photo, setPhoto] = useState(null); // { bytes: Uint8Array, url, naturalW, naturalH }
  const [aspectId, setAspectId] = useState(DEFAULT_ASPECT);
  const [baseCrop, setBaseCrop] = useState(null);
  const [crop, setCrop] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [geometry, setGeometry] = useState(null);
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [filter, setFilter] = useState('none');
  const [message, setMessage] = useState('');
  const [fontChoice, setFontChoice] = useState('system');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textAlign, setTextAlign] = useState('center');
  const [stickers, setStickers] = useState([]);
  const [error, setError] = useState(null);
  const [draftAvailable, setDraftAvailable] = useState(false);

  const stickerSeq = useRef(0);
  const objectUrlRef = useRef(null);

  // A previously unfinished postcard, offered once at startup rather than
  // silently resumed -- someone landing fresh (a shared link, a second
  // visit that isn't a continuation) shouldn't have yesterday's photo
  // reappear without asking.
  useEffect(() => {
    if (wasmModule?.unavailable) return;
    loadDraft()
      .then((draft) => setDraftAvailable(!!draft))
      .catch(() => {});
  }, [wasmModule]);

  const openPhoto = useCallback(
    async (file, restoredSettings) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = URL.createObjectURL(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      try {
        const { w, h } = await loadImageDimensions(url);
        const aspect = restoredSettings?.aspectId ?? DEFAULT_ASPECT;
        const base = wasmModule.suggest_crop(w, h, aspect);
        const geo = wasmModule.template_geometry(aspect);

        setPhoto({ bytes, url, naturalW: w, naturalH: h, mimeType: file.type || 'image/jpeg' });
        setAspectId(aspect);
        setBaseCrop(base);
        setCrop(restoredSettings?.crop ?? base);
        setZoom(restoredSettings?.zoom ?? 1);
        setGeometry(geo);
        setAdjustments(restoredSettings?.adjustments ?? DEFAULT_ADJUSTMENTS);
        setFilter(restoredSettings?.filter ?? 'none');
        setMessage(restoredSettings?.message ?? '');
        setFontChoice(restoredSettings?.fontChoice ?? 'system');
        setTextColor(restoredSettings?.textColor ?? '#ffffff');
        setTextAlign(restoredSettings?.textAlign ?? 'center');
        setStickers(restoredSettings?.stickers ?? []);
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
      if (!photo) {
        setAspectId(nextAspect);
        return;
      }
      const base = wasmModule.suggest_crop(photo.naturalW, photo.naturalH, nextAspect);
      setAspectId(nextAspect);
      setBaseCrop(base);
      setCrop(base);
      setZoom(1);
      setGeometry(wasmModule.template_geometry(nextAspect));
    },
    [photo, wasmModule],
  );

  const changeZoom = useCallback(
    (nextZoom) => {
      if (!photo || !baseCrop) return;
      setCrop((current) => zoomedCrop(current, baseCrop, photo.naturalW, photo.naturalH, nextZoom));
      setZoom(nextZoom);
    },
    [photo, baseCrop],
  );

  const addSticker = useCallback((id) => {
    stickerSeq.current += 1;
    const n = stickerSeq.current;
    setStickers((current) => [
      ...current,
      { key: `s${n}`, id, x: 0.5 + ((n % 3) - 1) * 0.1, y: 0.5 + ((n % 2) - 0.5) * 0.14, scale: 1 },
    ]);
  }, []);

  const moveSticker = useCallback((index, x, y) => {
    setStickers((current) => current.map((s, i) => (i === index ? { ...s, x, y } : s)));
  }, []);

  const removeSticker = useCallback((index) => {
    setStickers((current) => current.filter((_, i) => i !== index));
  }, []);

  const startOver = useCallback(async () => {
    const ok = await confirm(t('confirm.startOverBody'), t('confirm.confirm'));
    if (!ok) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPhoto(null);
    setAspectId(DEFAULT_ASPECT);
    setBaseCrop(null);
    setCrop(null);
    setZoom(1);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setFilter('none');
    setMessage('');
    setFontChoice('system');
    setTextColor('#ffffff');
    setTextAlign('center');
    setStickers([]);
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
        textColor,
        textAlign,
        stickers,
      }).catch(() => {});
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [photo, aspectId, crop, zoom, adjustments, filter, message, fontChoice, textColor, textAlign, stickers]);

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

        {!photo && <Intro onPhotoFile={openPhoto} />}

        {photo && crop && (
          <div className="editor-layout">
            <div className="editor-preview-col">
              <PostcardCanvas
                photoUrl={photo.url}
                naturalW={photo.naturalW}
                naturalH={photo.naturalH}
                crop={crop}
                onCropChange={setCrop}
                aspectRatio={aspectRatio(aspectId)}
                adjustments={adjustments}
                filter={filter}
                geometry={geometry}
                message={message}
                font={effectiveFont(fontChoice, message)}
                textColor={textColor}
                textAlign={textAlign}
                stickers={stickers}
                onStickerMove={moveSticker}
                onStickerRemove={removeSticker}
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
                onFilterChange={setFilter}
                adjustments={adjustments}
                onAdjustmentsChange={setAdjustments}
                onReset={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
              />
              <TextPanel
                message={message}
                onMessageChange={setMessage}
                font={fontChoice}
                onFontChange={setFontChoice}
                textColor={textColor}
                onTextColorChange={setTextColor}
                textAlign={textAlign}
                onTextAlignChange={setTextAlign}
              />
              <div className="panel">
                <h2>{t('stickers.heading')}</h2>
                <StickerPalette onAdd={addSticker} />
              </div>
              <ShareBar
                postcard={{
                  wasmModule,
                  photoBytes: photo.bytes,
                  crop,
                  adjustments,
                  filter,
                  message,
                  font: effectiveFont(fontChoice, message),
                  textColor,
                  textAlign,
                  stickers,
                  geometry,
                }}
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
