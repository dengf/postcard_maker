import { normalizeLegacyFill } from './fillTreatments';

/**
 * All in-progress-postcard state in one reducer, replacing what had grown
 * to 15+ independent `useState` calls in `App.jsx` before the doodle
 * layer, "Suggest a look", and the back side were added -- each of those
 * would have pushed it further past maintainable. Deliberately NOT
 * shared with the collage flow (`CollageEditor.jsx` has its own state):
 * unifying "one photo" into "collage of one" would touch this
 * already-shipped, tested path for no real benefit. Pure function, no
 * wasm/fetch/DOM here -- every action carries whatever an async step
 * (wasm crop suggestion, template geometry) already computed.
 */

export const DEFAULT_ADJUSTMENTS = { brightness: 0, contrast: 1, saturation: 1 };
export const DEFAULT_STROKE_COLOR = '#e0355b';
export const DEFAULT_STROKE_WIDTH = 4;

export function initialState(defaultAspect) {
  return {
    photo: null, // { bytes, url, naturalW, naturalH, mimeType }
    aspectId: defaultAspect,
    baseCrop: null,
    crop: null,
    zoom: 1,
    // Degrees clockwise. The crop above is read in the *rotated* photo's
    // coordinates once this is non-zero -- see `rotateGeometry.js`.
    rotation: 0,
    geometry: null,
    adjustments: DEFAULT_ADJUSTMENTS,
    filter: 'none',
    message: '',
    fontChoice: 'system',
    // 1 = "Auto" -- the fit-to-message-area size `fitText.js` computes,
    // not a fixed pixel value. Other choices scale relative to that.
    fontScale: 1,
    // 'auto' rather than a literal, so the very first postcard someone
    // makes gets `autoTextColor.js`'s WCAG contrast pick against the
    // pixels actually behind the message. The old default of plain white
    // measured 1.56:1 over a pale sand photo -- under WCAG's 3:1 floor
    // for large text -- while 'auto' resolved the same card to ~10.9:1.
    // A literal is still one tap away in TextPanel for anyone who wants
    // to override it.
    textColor: 'auto',
    textAlign: 'center',
    // `null` means "wherever `geometry.messageArea` puts it" (the only
    // behavior that existed before dragging did) -- an explicit
    // `{x, y}` (normalized, top-left corner) once the user drags the
    // message, overriding the default position but not its size.
    messagePosition: null,
    stickers: [],
    strokes: [],
    drawMode: false,
    strokeColor: DEFAULT_STROKE_COLOR,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    // `address` is free text, one recipient-address line per line of
    // input (name / street / city-state-zip), drawn onto the classic
    // ruled "To" lines -- see `export.js`'s `renderBackSide`.
    backSide: { enabled: false, location: '', address: '' },
    // 'full' | 'half' | 'bigSmall' -- how much of the card the photo
    // covers; 'full' is the only behavior that existed before this field.
    photoCoverage: 'full',
    // 'first' | 'second' -- left/top vs right/bottom, meaningless (but
    // still present) when photoCoverage is 'full'. See geometry.photoArea.
    photoSide: 'first',
    // Shape (+ optional ':variant') for how the blank area behind the
    // message is filled when photoCoverage isn't 'full' -- see
    // `fillTreatments.js`. 'auto' fillColor means "sample the photo",
    // same default behavior a bare 'solid' shape had before that module
    // existed.
    fillStyle: 'solid',
    fillColor: 'auto',
  };
}

/** Monotonic id for a new sticker's React `key`. Called from dispatch
 * sites, never from inside the reducer -- a reducer must produce the
 * same next state for the same (state, action) every time, including
 * under React 18 StrictMode's intentional double-invocation in dev, so
 * id generation can't live in the reducer itself. */
let stickerSeq = 0;
export function nextStickerKey() {
  stickerSeq += 1;
  return `s${stickerSeq}`;
}

export function postcardReducer(state, action) {
  switch (action.type) {
    case 'OPEN_PHOTO': {
      const { fillStyle, fillColor } = normalizeLegacyFill(action.restored?.fillStyle, action.restored?.fillColor);
      return {
        ...initialState(action.aspect),
        photo: action.photo,
        aspectId: action.aspect,
        baseCrop: action.base,
        crop: action.restored?.crop ?? action.base,
        zoom: action.restored?.zoom ?? 1,
        rotation: action.restored?.rotation ?? 0,
        geometry: action.geometry,
        adjustments: action.restored?.adjustments ?? DEFAULT_ADJUSTMENTS,
        filter: action.restored?.filter ?? 'none',
        message: action.restored?.message ?? '',
        fontChoice: action.restored?.fontChoice ?? 'system',
        fontScale: action.restored?.fontScale ?? 1,
        textColor: action.restored?.textColor ?? 'auto',
        textAlign: action.restored?.textAlign ?? 'center',
        messagePosition: action.restored?.messagePosition ?? null,
        stickers: action.restored?.stickers ?? [],
        strokes: action.restored?.strokes ?? [],
        // Spread over the default rather than `?? {...}` whole -- an
        // older draft saved before `address` existed would otherwise
        // restore with that field simply missing (`undefined`), turning
        // `BackSidePanel`'s address textarea into an uncontrolled input.
        backSide: { enabled: false, location: '', address: '', ...action.restored?.backSide },
        photoCoverage: action.restored?.photoCoverage ?? 'full',
        photoSide: action.restored?.photoSide ?? 'first',
        fillStyle,
        fillColor,
      };
    }

    /**
     * A different photo on the card someone is already making -- not a
     * new card. `OPEN_PHOTO` above resets to `initialState`, which is
     * right when a photo arrives from the intro screen and wrong here:
     * swapping the photo would silently throw away the message, the
     * stickers, the doodle, the back side and the chosen template.
     *
     * What does reset is exactly what belonged to the old photo -- crop,
     * zoom, rotation, filter, adjustments -- because a crop is in the old
     * photo's pixel coordinates and a filter was picked to suit it. That's the
     * same line `collageReducer`'s `OPEN_SLOT_PHOTO` draws: per-photo
     * look starts fresh, everything shared by the card stays.
     */
    case 'REPLACE_PHOTO':
      return {
        ...state,
        photo: action.photo,
        baseCrop: action.base,
        crop: action.base,
        zoom: 1,
        rotation: 0,
        adjustments: DEFAULT_ADJUSTMENTS,
        filter: 'none',
      };

    case 'CHANGE_ASPECT':
      return {
        ...state,
        aspectId: action.aspect,
        baseCrop: action.base,
        crop: action.base,
        zoom: 1,
        geometry: action.geometry,
        // A new aspect means a new `messageArea` shape and position --
        // a dragged offset for the old one could easily land off-card or
        // over the stamp corner on the new one, same reasoning `crop`
        // resets to `base` right above.
        messagePosition: null,
      };

    // Changing how much of the card the photo covers (and which side)
    // changes the photo's own on-card pixel ratio, so the crop has to be
    // re-suggested against it -- same shape as CHANGE_ASPECT, since it's
    // the same kind of "the template geometry changed" event.
    case 'SET_LAYOUT':
      return {
        ...state,
        photoCoverage: action.coverage,
        photoSide: action.side,
        baseCrop: action.base,
        crop: action.base,
        zoom: 1,
        geometry: action.geometry,
        // Same reasoning as `CHANGE_ASPECT`: a split changes where
        // `messageArea` sits entirely, so a dragged position from before
        // no longer means anything.
        messagePosition: null,
      };

    case 'SET_FILL_STYLE':
      return { ...state, fillStyle: action.fillStyle };

    case 'SET_FILL_COLOR':
      return { ...state, fillColor: action.fillColor };

    // One action for the whole two-finger gesture: pinching zooms and
    // twisting rotates on the same two fingers, and a crop, zoom and
    // rotation that disagreed for even one render would show as a jump.
    // `rotation` is optional so the zoom slider, which cannot rotate, can
    // keep dispatching this untouched.
    case 'CHANGE_ZOOM':
      return {
        ...state,
        crop: action.crop,
        zoom: action.zoom,
        rotation: action.rotation ?? state.rotation,
      };

    /* Turning the photo moves the goalposts for the crop: the photo fills
     * a differently-shaped box at the new angle, and the zoom-1 crop that
     * fits inside it is a different rectangle. The caller works all three
     * out together (it has the wasm module; see `App.jsx`'s `rotateTo`)
     * rather than this reducer recomputing part of it and leaving the
     * rest stale. */
    case 'SET_ROTATION':
      return {
        ...state,
        rotation: action.rotation,
        baseCrop: action.base,
        crop: action.crop,
        zoom: action.zoom ?? state.zoom,
      };

    case 'SET_CROP':
      return { ...state, crop: action.crop };

    case 'SET_ADJUSTMENTS':
      return { ...state, adjustments: action.adjustments };

    case 'RESET_ADJUSTMENTS':
      return { ...state, adjustments: DEFAULT_ADJUSTMENTS };

    case 'SET_FILTER':
      return { ...state, filter: action.filter };

    case 'SET_MESSAGE':
      return { ...state, message: action.message };

    case 'SET_MESSAGE_POSITION':
      return { ...state, messagePosition: { x: action.x, y: action.y } };

    case 'SET_FONT_CHOICE':
      return { ...state, fontChoice: action.fontChoice };

    case 'SET_FONT_SCALE':
      return { ...state, fontScale: action.fontScale };

    case 'SET_TEXT_COLOR':
      return { ...state, textColor: action.textColor };

    case 'SET_TEXT_ALIGN':
      return { ...state, textAlign: action.textAlign };

    case 'ADD_STICKER':
      return {
        ...state,
        stickers: [...state.stickers, { key: action.key, id: action.id, x: action.x, y: action.y, scale: 1 }],
      };

    case 'MOVE_STICKER':
      return {
        ...state,
        stickers: state.stickers.map((s, i) => (i === action.index ? { ...s, x: action.x, y: action.y } : s)),
      };

    case 'REMOVE_STICKER':
      return { ...state, stickers: state.stickers.filter((_, i) => i !== action.index) };

    // Applies a "Suggest a look" result in one step so the filter and the
    // sticker it recommends land in the same render, rather than as two
    // separate dispatches that could interleave with something else.
    // `action.filter`/`action.adjustments` are each optional and merge
    // rather than overwrite -- an exposure suggestion
    // (`exposureSuggestion.js`) only ever carries `adjustments`, no
    // filter or sticker, since it's based on pixel statistics alone,
    // not the vibe classifier. `action.layout` is present only when the
    // candidate also changed the photo/blank split -- `App.jsx`'s
    // `applyVibe` has already done the async wasm geometry/crop recompute
    // by the time this dispatches, the same way a manual layout change
    // does, so this reducer stays a synchronous merge like every other
    // field here.
    case 'APPLY_VIBE':
      return {
        ...state,
        filter: action.filter ?? state.filter,
        adjustments: action.adjustments ? { ...state.adjustments, ...action.adjustments } : state.adjustments,
        stickers: action.stickerId
          ? [...state.stickers, { key: action.key, id: action.stickerId, x: 0.5, y: 0.5, scale: 1 }]
          : state.stickers,
        fontChoice: action.fontChoice ?? state.fontChoice,
        fontScale: action.fontScale ?? state.fontScale,
        textColor: action.textColor ?? state.textColor,
        fillStyle: action.fillStyle ?? state.fillStyle,
        fillColor: action.fillColor ?? state.fillColor,
        ...(action.layout
          ? {
              photoCoverage: action.layout.coverage,
              photoSide: action.layout.side,
              baseCrop: action.layout.base,
              crop: action.layout.base,
              zoom: 1,
              geometry: action.layout.geometry,
              // Same reasoning as `SET_LAYOUT`'s own reset.
              messagePosition: null,
            }
          : null),
      };

    case 'ADD_STROKE':
      return { ...state, strokes: [...state.strokes, action.stroke] };

    case 'UNDO_STROKE':
      return { ...state, strokes: state.strokes.slice(0, -1) };

    case 'CLEAR_STROKES':
      return { ...state, strokes: [] };

    case 'SET_DRAW_MODE':
      return { ...state, drawMode: action.drawMode };

    case 'SET_STROKE_COLOR':
      return { ...state, strokeColor: action.color };

    case 'SET_STROKE_WIDTH':
      return { ...state, strokeWidth: action.width };

    case 'SET_BACK_SIDE_ENABLED':
      return { ...state, backSide: { ...state.backSide, enabled: action.enabled } };

    case 'SET_BACK_SIDE_LOCATION':
      return { ...state, backSide: { ...state.backSide, location: action.location } };

    case 'SET_BACK_SIDE_ADDRESS':
      return { ...state, backSide: { ...state.backSide, address: action.address } };

    case 'RESET':
      return initialState(action.defaultAspect);

    default:
      return state;
  }
}
