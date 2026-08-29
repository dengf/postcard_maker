import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { ASPECTS, aspectRatio } from '../aspect';
import { zoomedCrop } from '../cropGesture';
import { effectiveFont } from '../fonts';
import { detectLocation } from '../location';
import { renderCollage } from '../export';
import { collageReducer, initialCollageState } from '../collageReducer';
import { nextStickerKey } from '../postcardReducer';
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
import { ImageIcon } from './icons';

function loadImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`could not read dimensions for ${url}`));
    img.src = url;
  });
}

/** A slot's own on-card pixel aspect ratio: its fraction of the card,
 * scaled by the whole card's ratio -- see CLAUDE.md/`crop.rs`'s
 * `suggest_for_ratio` for why a collage slot needs this instead of one
 * of the three named templates. */
function slotPixelRatio(area, cardRatio) {
  return (area.w / area.h) * cardRatio;
}

/**
 * The multi-photo collage flow -- a parallel state machine to the
 * single-photo `App.jsx`, not a variant of it. See CLAUDE.md for why.
 */
export default function CollageEditor({ wasmModule, onError, onExit }) {
  const { t, locale } = useI18n();
  const [aspectId, setAspectId] = useState(ASPECTS[0].id);
  const [layouts, setLayouts] = useState([]);
  const [geometry, setGeometry] = useState(null);
  const [state, dispatch] = useReducer(collageReducer, null, () => initialCollageState('', 0));
  const objectUrlsRef = useRef([]);
  const frameRef = useRef(null);

  const selectLayout = useCallback(
    (layout) => {
      dispatch({ type: 'SET_LAYOUT', layoutId: layout.id, slotCount: layout.slots.length });
    },
    [],
  );

  // (Re)loads the curated layouts whenever the template shape changes,
  // and always lands on the first one -- same "pick a sensible default"
  // rule as the single-photo flow's template picker.
  useEffect(() => {
    try {
      const fetched = wasmModule.collage_layouts(aspectId);
      setLayouts(fetched);
      setGeometry(wasmModule.template_geometry(aspectId));
      if (fetched[0]) selectLayout(fetched[0]);
    } catch (err) {
      onError(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectLayout is stable (no deps of its own)
  }, [aspectId, wasmModule]);

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const layout = layouts.find((l) => l.id === state.layoutId);

  const openSlotPhoto = useCallback(
    async (index, file) => {
      if (!layout) return;
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
      } catch (err) {
        onError(err);
      }
    },
    [layout, aspectId, wasmModule, onError],
  );

  const activeSlot = state.slots[state.activeSlotIndex];

  const changeActiveZoom = (nextZoom) => {
    if (!activeSlot?.photo) return;
    const crop = zoomedCrop(activeSlot.crop, activeSlot.baseCrop, activeSlot.photo.naturalW, activeSlot.photo.naturalH, nextZoom);
    dispatch({ type: 'SET_SLOT_ZOOM', index: state.activeSlotIndex, crop, zoom: nextZoom });
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

  const allSlotsFilled = state.slots.length > 0 && state.slots.every((s) => s.photo);
  const effFont = effectiveFont(state.fontChoice, state.message);
  const postmarkDate = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="editor-layout">
      <div className="editor-preview-col">
        <TemplatePicker aspectId={aspectId} onChange={setAspectId} />

        <div className="panel">
          <h2>{t('collage.layout')}</h2>
          <div className="collage-layout-options">
            {layouts.map((l) => (
              <button
                key={l.id}
                type="button"
                className={l.id === state.layoutId ? 'collage-layout-swatch active' : 'collage-layout-swatch'}
                onClick={() => selectLayout(l)}
              >
                <span className="collage-layout-preview" style={{ aspectRatio: aspectRatio(aspectId) }}>
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
            ))}
          </div>
        </div>

        <div ref={frameRef} className="postcard-frame collage-frame" style={{ aspectRatio: aspectRatio(aspectId) }}>
          {state.slots.map((slot, index) => (
            <div
              key={index}
              className={index === state.activeSlotIndex ? 'collage-slot active' : 'collage-slot'}
              style={{
                left: `${layout.slots[index].area.x * 100}%`,
                top: `${layout.slots[index].area.y * 100}%`,
                width: `${layout.slots[index].area.w * 100}%`,
                height: `${layout.slots[index].area.h * 100}%`,
              }}
              onClick={() => dispatch({ type: 'SET_ACTIVE_SLOT', index })}
            >
              {slot.photo ? (
                <CollagePhotoSlot
                  photoUrl={slot.photo.url}
                  naturalW={slot.photo.naturalW}
                  naturalH={slot.photo.naturalH}
                  crop={slot.crop}
                  onCropChange={(crop) => dispatch({ type: 'SET_SLOT_CROP', index, crop })}
                  adjustments={slot.adjustments}
                  filter={slot.filter}
                />
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
            stickers={state.stickers}
            onStickerMove={(index, x, y) => dispatch({ type: 'MOVE_STICKER', index, x, y })}
            onStickerRemove={(index) => dispatch({ type: 'REMOVE_STICKER', index })}
          />
          <DoodleLayer
            strokes={state.strokes}
            drawMode={state.drawMode}
            strokeColor={state.strokeColor}
            strokeWidth={state.strokeWidth}
            onAddStroke={(stroke) => dispatch({ type: 'ADD_STROKE', stroke })}
          />
        </div>

        <button type="button" className="btn ghost" onClick={onExit}>
          {t('intro.startOver')}
        </button>
      </div>

      <div className="editor-controls-col">
        {activeSlot?.photo && (
          <FilterPanel
            zoom={activeSlot.zoom}
            onZoomChange={changeActiveZoom}
            filter={activeSlot.filter}
            onFilterChange={(f) => dispatch({ type: 'SET_SLOT_FILTER', index: state.activeSlotIndex, filter: f })}
            adjustments={activeSlot.adjustments}
            onAdjustmentsChange={(a) => dispatch({ type: 'SET_SLOT_ADJUSTMENTS', index: state.activeSlotIndex, adjustments: a })}
            onReset={() => dispatch({ type: 'RESET_SLOT_ADJUSTMENTS', index: state.activeSlotIndex })}
          />
        )}

        <TextPanel
          message={state.message}
          onMessageChange={(m) => dispatch({ type: 'SET_MESSAGE', message: m })}
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
          <ShareBar
            renderFront={() =>
              renderCollage({
                wasmModule,
                aspectRatio: aspectRatio(aspectId),
                slots: state.slots.map((s, i) => ({
                  photoBytes: s.photo.bytes,
                  crop: s.crop,
                  adjustments: s.adjustments,
                  filter: s.filter,
                  area: layout.slots[i].area,
                })),
                message: state.message,
                font: effFont,
                fontScale: state.fontScale,
                textColor: state.textColor,
                textAlign: state.textAlign,
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
        )}
      </div>
    </div>
  );
}

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
