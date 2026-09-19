/**
 * Double-tap detection for the photo surfaces, done from the pointer
 * events those surfaces already handle rather than from `dblclick`.
 *
 * Two reasons it isn't `dblclick`: the pan surfaces set
 * `touch-action: none` and capture the pointer, so what a touch browser
 * synthesizes on top of that is not something to rely on; and a double
 * tap has to be told apart from a *drag* that happened to start and end
 * near the same place, which only the pointer stream knows.
 *
 * Pure functions plus one tiny mutable log, same shape as
 * `cropGesture.js`: the components own the event handlers, this owns the
 * arithmetic.
 */

/** How long the second tap may arrive after the first. */
export const DOUBLE_TAP_WINDOW_MS = 320;

/** How far a pointer may travel and still count as a tap, not a pan. */
export const TAP_TRAVEL_PX = 12;

/** How far apart the two taps may land. Roughly a fingertip. */
export const TAP_GAP_PX = 44;

/** Distance between two points, in screen pixels. */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A finished pointer gesture -- `{ x, y, time, travel }` -- counts as a
 * tap when the pointer barely moved. `travel` is the furthest the
 * pointer ever got from where it went down, not the distance between
 * down and up: a pan out and back would otherwise read as a tap.
 */
export function isTap(gesture) {
  return !!gesture && gesture.travel <= TAP_TRAVEL_PX;
}

export function isDoubleTap(previous, tap) {
  if (!isTap(previous) || !isTap(tap)) return false;
  if (tap.time - previous.time > DOUBLE_TAP_WINDOW_MS) return false;
  return distance(previous, tap) <= TAP_GAP_PX;
}

/** The per-surface memory of the last tap. One per photo surface. */
export function createTapLog() {
  return { last: null };
}

/**
 * Records a finished gesture. Returns whether it completed a double tap.
 *
 * A firing tap clears the log, so a third tap in a row starts a fresh
 * pair instead of firing again -- an impatient triple tap on the photo
 * should open the picker once, not twice.
 */
export function recordTap(log, gesture) {
  const fired = isDoubleTap(log.last, gesture);
  log.last = fired ? null : gesture;
  return fired;
}
