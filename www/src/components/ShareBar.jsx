import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { renderBackSide } from '../export';
import { shareFiles, saveFiles } from '../share';
import { mailtoUrl } from '../mailto';
import { ShareIcon, SaveIcon } from './icons';
import CelebrationBurst from './CelebrationBurst';

const FRONT_FILENAME = 'postcard.jpg';
const BACK_FILENAME = 'postcard-back.jpg';

/**
 * Finish: Share or Save, for either the single-photo or the collage
 * flow -- `renderFront` is supplied by the caller (`renderPostcard` or
 * `renderCollage`) so this component doesn't need to know which kind of
 * postcard it's finishing. `backSide` is optional; when present, a
 * second image renders and rides along in the same Share/Save action --
 * `navigator.share` already supports a multi-file `files` array
 * natively, so this is additive, not a rewrite of the single-image path.
 */
export default function ShareBar({ renderFront, backSide, onError }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);
  const [celebrateAt, setCelebrateAt] = useState(0);

  const buildFiles = async () => {
    const frontBlob = await renderFront();
    const files = [{ blob: frontBlob, filename: FRONT_FILENAME }];
    if (backSide?.enabled) {
      const backBlob = await renderBackSide(backSide);
      files.push({ blob: backBlob, filename: BACK_FILENAME });
    }
    return files;
  };

  const run = async (after) => {
    setBusy(true);
    setHint(null);
    try {
      const files = await buildFiles();
      await after(files);
      setCelebrateAt(Date.now());
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleShare = () =>
    run(async (files) => {
      const shared = await shareFiles(files, {
        title: t('share.shareTitle'),
        text: t('share.shareText'),
      });
      if (!shared) {
        saveFiles(files);
        window.location.href = mailtoUrl({
          recipients: '',
          subject: t('share.mailSubject'),
          body: t('share.mailBody'),
        });
      }
      setHint(t('share.saveHint'));
    });

  const handleSave = () =>
    run(async (files) => {
      saveFiles(files);
      setHint(t('share.saveHint'));
    });

  return (
    <div className="panel">
      <h2>{t('share.heading')}</h2>
      <div className="share-actions">
        <button type="button" className="btn" onClick={handleShare} disabled={busy}>
          <ShareIcon />
          {t('share.share')}
        </button>
        <button type="button" className="btn secondary" onClick={handleSave} disabled={busy}>
          <SaveIcon />
          {t('share.save')}
        </button>
      </div>
      {busy && <p className="share-hint">{t('share.processing')}</p>}
      {hint && !busy && <p className="share-hint">{hint}</p>}
      <CelebrationBurst trigger={celebrateAt} />

      {/* Mobile-only duplicate of the buttons above -- on the single-column
          layout this panel can sit two-plus screens below the fold, so a
          fixed bottom bar keeps Share/Save one thumb-tap away regardless of
          scroll position. CSS-only on narrow viewports; the desktop
          two-column layout already keeps the postcard (and this panel) in
          view via the sticky preview column, so it hides itself there. */}
      <div className="share-sticky-bar">
        {busy && <p className="share-hint">{t('share.processing')}</p>}
        {hint && !busy && <p className="share-hint">{hint}</p>}
        <div className="share-sticky-actions">
          <button type="button" className="btn" onClick={handleShare} disabled={busy}>
            <ShareIcon />
            {t('share.share')}
          </button>
          <button type="button" className="btn secondary" onClick={handleSave} disabled={busy}>
            <SaveIcon />
            {t('share.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
