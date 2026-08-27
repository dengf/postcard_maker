import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { renderPostcard } from '../export';
import { sharePostcard, savePostcard } from '../share';
import { mailtoUrl } from '../mailto';
import { ShareIcon, SaveIcon } from './icons';

const FILENAME = 'postcard.jpg';

export default function ShareBar({ postcard, onError }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);

  const run = async (after) => {
    setBusy(true);
    setHint(null);
    try {
      const blob = await renderPostcard(postcard);
      await after(blob);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleShare = () =>
    run(async (blob) => {
      const shared = await sharePostcard(blob, FILENAME, {
        title: t('share.shareTitle'),
        text: t('share.shareText'),
      });
      if (!shared) {
        savePostcard(blob, FILENAME);
        window.location.href = mailtoUrl({
          recipients: '',
          subject: t('share.mailSubject'),
          body: t('share.mailBody'),
        });
      }
      setHint(t('share.saveHint'));
    });

  const handleSave = () =>
    run(async (blob) => {
      savePostcard(blob, FILENAME);
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
    </div>
  );
}
