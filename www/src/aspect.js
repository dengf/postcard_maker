/**
 * The three postcard shapes, mirroring `postcard_core::Aspect` exactly --
 * host-layer only because it's a fixed, tiny lookup the UI needs before a
 * photo is even picked (to size the crop frame), not a calculation.
 */
export const ASPECTS = [
  { id: 'landscape', ratio: 3 / 2, labelKey: 'template.landscape' },
  { id: 'square', ratio: 1, labelKey: 'template.square' },
  { id: 'portrait', ratio: 5 / 7, labelKey: 'template.portrait' },
];

export function aspectRatio(id) {
  return ASPECTS.find((a) => a.id === id)?.ratio ?? ASPECTS[0].ratio;
}
