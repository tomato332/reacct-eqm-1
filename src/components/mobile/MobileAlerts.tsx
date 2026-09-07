import React from 'react';
import { useTranslation } from 'react-i18next';
import { EEWState } from '../../WolfxEEWService';
import { FusionContext } from '../../hooks/useEEWFusion';
import { WaveStats, DetectionAlertInfo } from '../../types';
import { translateRegionName, translatePrefecture } from '../../translateUtils';
import { AlertTriangle, MapPin, X } from 'lucide-react';
import styles from './MobileView.module.css';

interface MobileAlertsProps {
  fusionContext: FusionContext;
  waveStats: WaveStats;
  handleDismissEEW: () => void;
  detectionAlert: DetectionAlertInfo | null;
  handleDismissDetection: () => void;
  onFocusEpicenter: (lat: number, lon: number) => void;
}

export const MobileAlerts: React.FC<MobileAlertsProps> = ({
  fusionContext,
  waveStats,
  handleDismissEEW,
  detectionAlert,
  handleDismissDetection,
  onFocusEpicenter,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const hasEEW = fusionContext.state !== EEWState.IDLE && fusionContext.data;
  const eewData = fusionContext.data;

  return (
    <div className={styles.mobileAlertsArea}>
      {/* 1. 긴급 지진 속보 (EEW) */}
      {hasEEW && eewData && (
        <div className={styles.mobileEewBanner} role="alert">
          <div className={styles.mobileEewHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
              <AlertTriangle size={16} />
              <span>{eewData.Title || t('eew.title') || '긴급지진속보'}</span>
            </div>
            <button
              type="button"
              onClick={handleDismissEEW}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 2 }}
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>

          <div className={styles.mobileEewBody}>
            <div className={styles.mobileEewMainRow}>
              <div className={styles.mobileEewEpicenter}>
                {translateRegionName(eewData.Hypocenter || '', currentLang) || t('eew.unknownEpicenter')}
              </div>
              {eewData.MaxIntensity && (
                <span className={styles.mobileEewBadge}>
                  {t('eew.maxIntensity', { scale: eewData.MaxIntensity })}
                </span>
              )}
            </div>

            <div className={styles.mobileEewDetailRow}>
              <span>M{eewData.Magunitude ?? '-'}</span>
              <span>{eewData.Depth ?? '-'}km</span>
              <span>{t('eew.seconds', { sec: waveStats.elapsedSec })}</span>
            </div>

            <div className={styles.mobileEewWaveRow}>
              <span style={{ color: '#2563eb' }}>P: {waveStats.pRadius}km</span>
              <span style={{ color: '#ea580c' }}>S: {waveStats.sRadius}km</span>
              <span>{waveStats.elapsedSec}s</span>
            </div>

            {eewData.Latitude && eewData.Longitude && (
              <button
                type="button"
                className={styles.mobileFocusBtn}
                onClick={() => onFocusEpicenter(eewData.Latitude, eewData.Longitude)}
              >
                <MapPin size={16} />
                <span>{t('eew.focusEpicenter') || '진앙지로 이동'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. 실시간 흔들림 급증 감지 (Detection Alert) */}
      {detectionAlert && (
        <div
          className={styles.mobileEewBanner}
          style={{ borderColor: 'var(--accent-amber, #d97706)' }}
          role="alert"
        >
          <div
            className={styles.mobileEewHeader}
            style={{ backgroundColor: 'var(--accent-amber, #d97706)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
              <AlertTriangle size={16} />
              <span>{t('detectAlert.title') || '흔들림 감지 알림'}</span>
            </div>
            <button
              type="button"
              onClick={handleDismissDetection}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 2 }}
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>

          <div className={styles.mobileEewBody}>
            <div className={styles.mobileEewMainRow}>
              <div className={styles.mobileEewEpicenter}>
                {detectionAlert.region
                  ? `${translatePrefecture(detectionAlert.region, currentLang)} ${translateRegionName(detectionAlert.stationName, currentLang)}`
                  : translateRegionName(detectionAlert.stationName, currentLang)}
              </div>
              <span
                className={styles.mobileEewBadge}
                style={{ backgroundColor: detectionAlert.color || '#ef4444' }}
              >
                진도 {detectionAlert.intensity.toFixed(1)}
              </span>
            </div>

            {detectionAlert.center && (
              <button
                type="button"
                className={styles.mobileFocusBtn}
                onClick={() => onFocusEpicenter(detectionAlert.center![1], detectionAlert.center![0])}
              >
                <MapPin size={16} />
                <span>{t('detectAlert.focusMap') || '감지 위치로 이동'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

