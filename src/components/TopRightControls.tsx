import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DataSourceType } from '../types';
import styles from '../App.module.css';
import { Volume2, VolumeX, LocateFixed, Sun, Moon } from 'lucide-react';
import { audioService } from '../AudioService';

interface TopRightControlsProps {
  dataSource: DataSourceType;
  handleToggleDataSource: (s: DataSourceType) => void;
  handleResetCamera: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
}

export const TopRightControls: React.FC<TopRightControlsProps> = ({
  dataSource,
  handleToggleDataSource,
  handleResetCamera,
  isDarkMode,
  setIsDarkMode,
}) => {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: 'ko' | 'en' | 'ja') => {
    i18n.changeLanguage(lng);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('app_language', lng);
    }
  };

  const currentLng = i18n.language.startsWith('ja')
    ? 'ja'
    : i18n.language.startsWith('en')
    ? 'en'
    : 'ko';

  const [isMuted, setIsMuted] = useState(audioService.isMuted);

  useEffect(() => {
    setIsMuted(audioService.isMuted);
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    audioService.setMuted(next);
    setIsMuted(next);
    if (!next) {
       audioService.playUpdateBeep(1.0);
    }
  };

  return (
    <div className={styles.topRightControls}>
      {/* 데이터 소스 선택 */}
      <div className={styles.sourceToggleGroup}>
        <button
          type="button"
          className={`${styles.sourceToggleBtn} ${dataSource === 'kmoni' ? styles.sourceToggleActive : ''}`}
          onClick={() => handleToggleDataSource('kmoni')}
          title={t('sources.niedDesc')}
        >
          <span className={styles.sourceDot} />
          {t('sources.nied')}
        </button>
        <button
          type="button"
          className={`${styles.sourceToggleBtn} ${dataSource === 'yahoo' ? styles.sourceToggleActive : ''}`}
          onClick={() => handleToggleDataSource('yahoo')}
          title={t('sources.yahooDesc')}
        >
          <span className={styles.sourceDotYahoo} />
          {t('sources.yahoo')}
        </button>
        <button
          type="button"
          className={`${styles.sourceToggleBtn} ${dataSource === 'p2pquake' ? styles.sourceToggleActive : ''}`}
          onClick={() => handleToggleDataSource('p2pquake')}
          title={t('sources.p2pDesc')}
        >
          <span className={styles.sourceDotP2P} />
          {t('sources.p2p')}
        </button>
      </div>

      {/* 언어 선택기 */}
      <div className={styles.langToggleGroup}>
        <button
          type="button"
          className={`${styles.langBtn} ${currentLng === 'ko' ? styles.langBtnActive : ''}`}
          onClick={() => changeLanguage('ko')}
          title="한국어"
        >
          KO
        </button>
        <button
          type="button"
          className={`${styles.langBtn} ${currentLng === 'en' ? styles.langBtnActive : ''}`}
          onClick={() => changeLanguage('en')}
          title="English"
        >
          EN
        </button>
        <button
          type="button"
          className={`${styles.langBtn} ${currentLng === 'ja' ? styles.langBtnActive : ''}`}
          onClick={() => changeLanguage('ja')}
          title="日本語"
        >
          JA
        </button>
      </div>

      {/* 도구 모음 */}
      <div className={styles.iconControlsGroup}>
        <button type="button" className={styles.iconBtn} onClick={toggleMute} title={isMuted ? "소리 켜기" : "소리 끄기"}>
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button type="button" className={styles.iconBtn} onClick={handleResetCamera} title={t('controls.resetCamera')}>
          <LocateFixed size={16} />
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => setIsDarkMode(!isDarkMode)} title={isDarkMode ? t('controls.lightMode') : t('controls.darkMode')}>
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
};
