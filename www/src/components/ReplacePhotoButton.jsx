import React from 'react';
import { useI18n } from '../i18n';
import { SwapIcon } from './icons';

/**
 * The chip that swaps the photo under it -- on a collage slot and on the
 * single-photo card, which is why it lives here rather than inside
 * either editor.
 *
 * It's a button that asks its owner to open the picker, not a `<label>`
 * wrapping its own file input (which is what `EmptySlot` still is). The
 * picker has a second caller now: double-tapping the photo itself. One
 * hidden input per editor, opened from both paths, keeps "which photo is
 * being replaced" in one place instead of depending on which chip
 * happens to be mounted.
 *
 * `stopPropagation` on pointerdown keeps the tap from reaching the pan
 * handler underneath, which would otherwise start a drag on the photo
 * the moment you reach for the chip.
 */
export default function ReplacePhotoButton({ onRequest }) {
  const { t } = useI18n();
  const label = t('editor.replacePhoto');
  return (
    <button
      type="button"
      className="replace-photo"
      title={label}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onRequest}
    >
      <SwapIcon />
    </button>
  );
}

/**
 * The input both paths open. Hidden from the tab order and the
 * accessibility tree on purpose: `ReplacePhotoButton` above is the
 * control, and this is the mechanism it drives.
 *
 * Clearing `value` before handing the file over matters -- without it,
 * picking the same file twice in a row fires no `change` event at all,
 * so a second attempt at the photo you just failed to crop right would
 * silently do nothing.
 */
export function PhotoPickerInput({ inputRef, onPick }) {
  const onChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPick(file);
  };
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      onChange={onChange}
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}
