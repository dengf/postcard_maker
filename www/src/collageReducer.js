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

export function emptySlot() {
  return {
    photo: null,
    baseCrop: null,
    crop: null,
    zoom: 1,
    // Degrees clockwise; the crop is read in the *rotated* photo's
    // coordinates once this is non-zero -- see `rotateGeometry.js`.
    rotation: 0,
    adjustments: DEFAULT_ADJUSTMENTS,
    filter: 'none',
  };
}

export function initialCollageState(layoutId, slotCount) {
  return {
    layoutId,
    slots: Array.from({ length: slotCount }, emptySlot),
    activeSlotIndex: 0,
    message: '',
    fontChoice: 'system',
    fontScale: 1,
    // Matches the single-photo default -- see postcardReducer.js. The
    // collage live preview can't sample a single photo to resolve 'auto'
    // (PostcardOverlay falls back to a fixed color there), but
    // `export.js`'s `renderCollage` resolves it exactly at export the
    // same way `renderPostcard` does, so the saved card still gets the
    // contrast-checked color.
    textColor: 'auto',
    textAlign: 'center',
    messagePosition: null,
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
    /**
     * Moves the collage onto a different layout, keeping it.
     *
     * This used to return a fresh `initialCollageState` -- picking a
     * layout emptied every slot and threw away the message, stickers and
     * doodle with them. That was survivable while the layout was a
     * one-time choice among three, made before there was anything to
     * lose. It stopped being survivable with a Shuffle button: a row of
     * swatches you're invited to keep tapping cannot cost the card each
     * time.
     *
     * `slots` arrives already built, for the same reason `RESTORE_DRAFT`
     * does: fitting a photo to a slot of different proportions needs a
     * wasm crop suggestion, and this reducer has no wasm module. See
     * `collageLayouts.js`'s `carrySlots` for what carries and what
     * resets.
     */
    case 'SET_LAYOUT':
      return {
        ...state,
        layoutId: action.layoutId,
        slots: action.slots,
        // A layout with fewer slots can leave the selection past the end
        // -- every per-slot control reads `slots[activeSlotIndex]`.
        activeSlotIndex: Math.max(0, Math.min(state.activeSlotIndex, action.slots.length - 1)),
      };

    /**
     * A collage coming back from `draftStore`. `SET_LAYOUT` has already
     * run by this point (the layout decides how many slots there are),
     * so this fills in what was saved and leaves anything the draft
     * doesn't carry at the fresh default -- an older record, or a field
     * added after it was written, restores as a new collage would rather
     * than as `undefined`.
     *
     * `slots` arrives already hydrated: the caller has the wasm module
     * and the layout geometry needed to turn a stored blob back into a
     * photo with a base crop, and this reducer has neither.
     */
    case 'RESTORE_DRAFT': {
      const fresh = initialCollageState(state.layoutId, state.slots.length);
      const { draft } = action;
      return {
        ...fresh,
        slots: action.slots,
        message: draft.message ?? fresh.message,
        fontChoice: draft.fontChoice ?? fresh.fontChoice,
        fontScale: draft.fontScale ?? fresh.fontScale,
        textColor: draft.textColor ?? fresh.textColor,
        textAlign: draft.textAlign ?? fresh.textAlign,
        messagePosition: draft.messagePosition ?? fresh.messagePosition,
        stickers: draft.stickers ?? fresh.stickers,
        strokes: draft.strokes ?? fresh.strokes,
        strokeColor: draft.strokeColor ?? fresh.strokeColor,
        strokeWidth: draft.strokeWidth ?? fresh.strokeWidth,
        // Spread over the default rather than taking it whole, for the
        // same reason `postcardReducer`'s OPEN_PHOTO does: a record
        // written before `address` existed would otherwise restore with
        // the field missing and turn BackSidePanel's textarea into an
        // uncontrolled input.
        backSide: { ...fresh.backSide, ...draft.backSide },
      };
    }

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
          rotation: 0,
          adjustments: DEFAULT_ADJUSTMENTS,
          filter: 'none',
        }),
      };

    case 'SET_SLOT_CROP':
      return { ...state, slots: updateSlot(state.slots, action.index, { crop: action.crop }) };

    // Pinch and twist ride the same two fingers, so one action carries
    // crop, zoom and rotation together; `rotation` is optional because the
    // zoom slider, which cannot rotate, dispatches this too.
    case 'SET_SLOT_ZOOM':
      return {
        ...state,
        slots: updateSlot(state.slots, action.index, {
          crop: action.crop,
          zoom: action.zoom,
          ...(action.rotation === undefined ? null : { rotation: action.rotation }),
        }),
      };

    // Turning a slot's photo changes both the box its crop lives in and
    // the zoom-1 crop that fits -- `CollageEditor`'s `rotateSlot` works
    // all of it out together, since it has the wasm module.
    case 'SET_SLOT_ROTATION':
      return {
        ...state,
        slots: updateSlot(state.slots, action.index, {
          rotation: action.rotation,
          baseCrop: action.base,
          crop: action.crop,
          ...(action.zoom === undefined ? null : { zoom: action.zoom }),
        }),
      };

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
