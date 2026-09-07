import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DataSourceType } from '../../types';
import { Volume2, VolumeX, LocateFixed, Sun, Moon, MoreHorizontal, X, Globe } from 'lucide-react';
import { audioService } from '../../AudioService';
import styles from './MobileView.module.css';

interface MobileHeaderProps {
  dataSource: DataSourceType;
  handleToggleDataSource: (s: DataSourceType) => void;
  handleResetCamera: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  dataSource,
  handleToggleDataSource,
  handleResetCamera,
  isDarkMode,
  setIsDarkMode,
}) => {
  const { t, i18n } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
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

  return (
    <>
      <header className={styles.mobileHeader}>
        <div className={styles.headerTopRow}>
          <div className={styles.brandStatus}>
            <span className={styles.pulseDot} />
            <span>EQ Monitor</span>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerIconBtn}
              onClick={toggleMute}
              aria-label={isMuted ? '음소거 해제' : '음소거'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <button
              type="button"
              className={styles.headerIconBtn}
              onClick={handleResetCamera}
              aria-label="전역 뷰로 리셋"
            >
              <LocateFixed size={18} />
            </button>

            <button
              type="button"
              className={styles.headerIconBtn}
              onClick={() => setShowSettings(!showSettings)}
              aria-label="설정 메뉴"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        {/* 데이터 소스 세그먼트 버튼 */}
        <div className={styles.sourceTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={dataSource === 'kmoni'}
            className={`${styles.sourceTabItem} ${dataSource === 'kmoni' ? styles.sourceTabItemActive : ''}`}
            onClick={() => handleToggleDataSource('kmoni')}
          >
            <span className={styles.sourceIndicatorDot} />
            {t('sources.nied')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dataSource === 'yahoo'}
            className={`${styles.sourceTabItem} ${dataSource === 'yahoo' ? styles.sourceTabItemActive : ''}`}
            onClick={() => handleToggleDataSource('yahoo')}
          >
            <span className={styles.sourceIndicatorDotYahoo} />
            {t('sources.yahoo')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dataSource === 'p2pquake'}
            className={`${styles.sourceTabItem} ${dataSource === 'p2pquake' ? styles.sourceTabItemActive : ''}`}
            onClick={() => handleToggleDataSource('p2pquake')}
          >
            <span className={styles.sourceIndicatorDotP2P} />
            {t('sources.p2p')}
          </button>
        </div>
      </header>

      {/* 모바일 설정 팝업 드롭다운 */}
      {showSettings && (
        <div className={styles.settingsOverlay} onClick={() => setShowSettings(false)}>
          <div className={styles.settingsMenu} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={styles.settingsSectionTitle}>{t('controls.settings') || '설정'}</span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <div className={styles.settingsSectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Globe size={12} />
                <span>Language / 言語</span>
              </div>
              <div className={styles.langButtonGroup}>
                <button
                  type="button"
                  className={`${styles.mobileLangBtn} ${currentLng === 'ko' ? styles.mobileLangBtnActive : ''}`}
                  onClick={() => changeLanguage('ko')}
                >
                  한국어
                </button>
                <button
                  type="button"
                  className={`${styles.mobileLangBtn} ${currentLng === 'en' ? styles.mobileLangBtnActive : ''}`}
                  onClick={() => changeLanguage('en')}
                >
                  EN
                </button>
                <button
                  type="button"
                  className={`${styles.mobileLangBtn} ${currentLng === 'ja' ? styles.mobileLangBtnActive : ''}`}
                  onClick={() => changeLanguage('ja')}
                >
                  日本語
                </button>
              </div>
            </div>

            <div>
              <div className={styles.settingsSectionTitle}>Theme</div>
              <button
                type="button"
                className={styles.settingsRowBtn}
                onClick={() => setIsDarkMode(!isDarkMode)}
              >
                <span>{isDarkMode ? t('controls.lightMode') : t('controls.darkMode')}</span>
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
