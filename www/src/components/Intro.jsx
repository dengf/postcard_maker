import React, { useRef } from 'react';
import { useI18n } from '../i18n';
import CameraCapture from './CameraCapture';
import { CollageIcon, ImageIcon } from './icons';

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
      {/* An outlined chip, not the bare bold sentence this used to be
          ("Or make a collage from 2-3 photos"), which carried no
          background, border, underline or icon and so read as a caption
          sitting under the two real buttons. Outlined rather than filled
          keeps it third in the hierarchy while still being unmistakably a
          control, and the imperative label puts it in the same voice as
          "Take a photo" / "Choose a photo". The photo count moved into the
          collage editor's own layout picker, which shows the slots. */}
      <button type="button" className="btn outline intro-collage-link" onClick={onStartCollage}>
        <CollageIcon />
        {t('intro.makeCollage')}
      </button>
    </div>
  );
}
