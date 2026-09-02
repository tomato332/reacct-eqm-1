import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DetectionAlertInfo } from '../types';
import { translateRegionName, translatePrefecture } from '../translateUtils';
import styles from '../App.module.css';

interface DetectionAlertProps {
  alertInfo: DetectionAlertInfo | null;
  onDismiss: () => void;
  onFocusLocation?: (lat: number, lon: number) => void;
}

export const DetectionAlert: React.FC<DetectionAlertProps> = ({
  alertInfo,
  onDismiss,
  onFocusLocation,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [progressPercent, setProgressPercent] = useState(100);

  // 15초 유지 타이머 시각적 진행바
  useEffect(() => {
    if (!alertInfo) {
      setProgressPercent(100);
      return;
    }

    const duration = 15000;
    const startTime = alertInfo.timestamp;
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      const percent = (remaining / duration) * 100;
      setProgressPercent(percent);
      if (percent > 0) {
        requestAnimationFrame(updateProgress);
      }
    };

    const animId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animId);
  }, [alertInfo]);

  if (!alertInfo) return null;

  const transName = alertInfo.stationName ? translateRegionName(alertInfo.stationName, currentLang) : '';
  const transRegion = alertInfo.region ? translatePrefecture(alertInfo.region, currentLang) : '';
  const displayLocation = transRegion ? `${transRegion} ${transName || alertInfo.stationName}` : (transName || alertInfo.stationName || t('detectAlert.nationwideNotice'));

  const handleFocus = () => {
    if (alertInfo.center && onFocusLocation) {
      onFocusLocation(alertInfo.center[1], alertInfo.center[0]);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={styles.detectionAlertCard}
      id="detection-alert-card"
    >
      <div className={styles.detectionAlertHeader}>
        <div className={styles.detectionTitleBox}>
          <span className={styles.detectionPulseDot} />
          <h2 className={styles.detectionTitle}>
            {t('detectAlert.title', { source: alertInfo.sourceName })}
          </h2>
        </div>
        <button
          type="button"
          className={styles.detectionCloseBtn}
          onClick={onDismiss}
          aria-label={t('detectAlert.dismiss')}
          title={t('detectAlert.dismiss')}
        >
          &times;
        </button>
      </div>

      <div className={styles.detectionAlertBody}>
        {/* 예상 진도 표기: [KMONI 지진 감지] 예상 진도: 0 (-0.5) */}
        <div className={styles.detectionIntensityRow}>
          <span className={styles.detectionIntensityLabel}>
            {t('detectAlert.expectedIntensity')}:
          </span>
          <div className={styles.detectionBadgeGroup}>
            <span
              className={styles.detectionJindoBadge}
              style={{ backgroundColor: alertInfo.color }}
            >
              {alertInfo.jindoStr}
            </span>
            <span className={styles.detectionJindoValue}>
              ({alertInfo.jindoFormatted})
            </span>
          </div>
        </div>

        {/* 관측 위치 & 감지 시각 정보 */}
        <div className={styles.detectionMetaRow}>
          <div className={styles.detectionMetaItem}>
            <span className={styles.detectionMetaLabel}>{t('detectAlert.location')}</span>
            <span className={styles.detectionMetaVal} title={displayLocation}>
              {displayLocation}
            </span>
          </div>
          <div className={styles.detectionMetaItem}>
            <span className={styles.detectionMetaLabel}>{t('detectAlert.detectedAt')}</span>
            <span className={styles.detectionMetaVal}>{alertInfo.timeStr}</span>
          </div>
        </div>

        {/* 액션 버튼 */}
        {alertInfo.center && onFocusLocation && (
          <div className={styles.detectionActionsRow}>
            <button
              type="button"
              className={styles.detectionFocusBtn}
              onClick={handleFocus}
            >
              <span className={styles.detectionFocusIcon}>📍</span>
              <span>{t('detectAlert.focusMap')}</span>
            </button>
          </div>
        )}
      </div>

      {/* 15초 카운트다운 타이머 바 */}
      <div className={styles.detectionTimerBarTrack}>
        <div
          className={styles.detectionTimerBarFill}
          style={{ width: `${progressPercent}%`, backgroundColor: alertInfo.color }}
        />
      </div>
    </div>
  );
};
