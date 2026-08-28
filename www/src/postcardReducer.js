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
    geometry: null,
    adjustments: DEFAULT_ADJUSTMENTS,
    filter: 'none',
    message: '',
    fontChoice: 'system',
    // 1 = "Auto" -- the fit-to-message-area size `fitText.js` computes,
    // not a fixed pixel value. Other choices scale relative to that.
    fontScale: 1,
    textColor: '#ffffff',
    textAlign: 'center',
    stickers: [],
    strokes: [],
    drawMode: false,
    strokeColor: DEFAULT_STROKE_COLOR,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    backSide: { enabled: false, location: '' },
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
    case 'OPEN_PHOTO':
      return {
        ...initialState(action.aspect),
        photo: action.photo,
        aspectId: action.aspect,
        baseCrop: action.base,
        crop: action.restored?.crop ?? action.base,
        zoom: action.restored?.zoom ?? 1,
        geometry: action.geometry,
        adjustments: action.restored?.adjustments ?? DEFAULT_ADJUSTMENTS,
        filter: action.restored?.filter ?? 'none',
        message: action.restored?.message ?? '',
        fontChoice: action.restored?.fontChoice ?? 'system',
        fontScale: action.restored?.fontScale ?? 1,
        textColor: action.restored?.textColor ?? '#ffffff',
        textAlign: action.restored?.textAlign ?? 'center',
        stickers: action.restored?.stickers ?? [],
        strokes: action.restored?.strokes ?? [],
        backSide: action.restored?.backSide ?? { enabled: false, location: '' },
      };

    case 'CHANGE_ASPECT':
      return {
        ...state,
        aspectId: action.aspect,
        baseCrop: action.base,
        crop: action.base,
        zoom: 1,
        geometry: action.geometry,
      };

    case 'CHANGE_ZOOM':
      return { ...state, crop: action.crop, zoom: action.zoom };

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
    case 'APPLY_VIBE':
      return {
        ...state,
        filter: action.filter,
        stickers: action.stickerId
          ? [...state.stickers, { key: action.key, id: action.stickerId, x: 0.5, y: 0.5, scale: 1 }]
          : state.stickers,
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

    case 'RESET':
      return initialState(action.defaultAspect);

    default:
      return state;
  }
}
