/**
 * State for the collage flow -- deliberately separate from
 * `postcardReducer.js` (the single-photo flow), not a generalization of
 * it. See `CLAUDE.md`/`CollagePhotoSlot.jsx` for why unifying "one
 * photo" into "a collage of one" was rejected: real regression risk on
 * an already-shipped path for no benefit. The message/stickers/doodle
 * actions below look similar to `postcardReducer`'s because they're
 * genuinely the same *kind* of state, just living in a different
 * aggregate (shared across N photo slots instead of one) -- three
 * similar action handlers were judged cheaper to read than a shared
 * abstraction spanning two otherwise-different reducers.
 */

import { DEFAULT_ADJUSTMENTS, DEFAULT_STROKE_COLOR, DEFAULT_STROKE_WIDTH } from './postcardReducer';

function emptySlot() {
  return { photo: null, baseCrop: null, crop: null, zoom: 1, adjustments: DEFAULT_ADJUSTMENTS, filter: 'none' };
}

export function initialCollageState(layoutId, slotCount) {
  return {
    layoutId,
    slots: Array.from({ length: slotCount }, emptySlot),
    activeSlotIndex: 0,
    message: '',
    fontChoice: 'system',
    fontScale: 1,
    textColor: '#ffffff',
    textAlign: 'center',
    stickers: [],
    strokes: [],
    drawMode: false,
    strokeColor: DEFAULT_STROKE_COLOR,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    backSide: { enabled: false, location: '', address: '' },
  };
}

function updateSlot(slots, index, patch) {
  return slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
}

export function collageReducer(state, action) {
  switch (action.type) {
    case 'SET_LAYOUT':
      return { ...initialCollageState(action.layoutId, action.slotCount) };

    case 'SET_ACTIVE_SLOT':
      return { ...state, activeSlotIndex: action.index };

    case 'OPEN_SLOT_PHOTO':
      return {
        ...state,
        slots: updateSlot(state.slots, action.index, {
          photo: action.photo,
          baseCrop: action.base,
          crop: action.base,
          zoom: 1,
          adjustments: DEFAULT_ADJUSTMENTS,
          filter: 'none',
        }),
      };

    case 'SET_SLOT_CROP':
      return { ...state, slots: updateSlot(state.slots, action.index, { crop: action.crop }) };

    case 'SET_SLOT_ZOOM':
      return { ...state, slots: updateSlot(state.slots, action.index, { crop: action.crop, zoom: action.zoom }) };

    case 'SET_SLOT_ADJUSTMENTS':
      return { ...state, slots: updateSlot(state.slots, action.index, { adjustments: action.adjustments }) };

    case 'RESET_SLOT_ADJUSTMENTS':
      return {
        ...state,
        slots: updateSlot(state.slots, action.index, { adjustments: DEFAULT_ADJUSTMENTS }),
      };

    case 'SET_SLOT_FILTER':
      return { ...state, slots: updateSlot(state.slots, action.index, { filter: action.filter }) };

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

    default:
      return state;
  }
}
