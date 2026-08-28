import React, { useRef } from 'react';
import { useI18n } from '../i18n';
import CameraCapture from './CameraCapture';
import { ImageIcon } from './icons';

export default function Intro({ onPhotoFile, onStartCollage }) {
  const { t } = useI18n();
  const fileRef = useRef(null);

  const onChoose = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPhotoFile(file);
  };

  return (
    <div className="intro">
      <h2>{t('intro.heading')}</h2>
      <p className="intro-lede">{t('intro.subheading')}</p>
      <div className="intro-actions">
        <CameraCapture onFile={onPhotoFile} />
        <label className="btn secondary">
          <ImageIcon />
          {t('intro.choosePhoto')}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onChoose}
            className="visually-hidden"
          />
        </label>
      </div>
      <p className="intro-hint">{t('intro.heicHint')}</p>
      <button type="button" className="btn ghost intro-collage-link" onClick={onStartCollage}>
        {t('intro.makeCollage')}
      </button>
    </div>
  );
}
