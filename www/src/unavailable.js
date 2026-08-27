// What the app becomes when the image engine cannot be loaded.
//
// Unlike budget_planner's `unavailable.js`, there's no degraded mode worth
// offering: every screen past "pick a photo" needs `process_photo` to show
// anything at all, so this doesn't pretend otherwise per-function -- it
// marks itself `unavailable` and `App.jsx` shows one clear error screen
// instead of the editor. Same principle as the other meifio tools: report
// the failure and compute nothing, rather than a second, untested
// implementation of the image pipeline in JavaScript.
export function createUnavailableModule() {
  console.warn('Image engine unavailable - run `npm run build:wasm`.');

  const message = {
    code: 'err.engineUnavailable',
    params: {},
    text: 'The image engine could not be loaded.',
  };
  const fail = () => {
    throw message;
  };

  return {
    unavailable: true,
    process_photo: fail,
    suggest_crop: fail,
    template_geometry: fail,
  };
}
