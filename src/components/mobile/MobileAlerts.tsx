import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EEWState } from '../../WolfxEEWService';
import { FusionContext } from '../../hooks/useEEWFusion';
import { WaveStats, DetectionAlertInfo } from '../../types';
import { translateRegionName, translatePrefecture } from '../../translateUtils';
import { AlertTriangle, MapPin, X, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);

  const hasEEW = fusionContext.state !== EEWState.IDLE && fusionContext.data;
  const eewData = fusionContext.data;

  return (
    <div className={styles.mobileAlertsArea}>
      {/* 1. 긴급 지진 속보 (EEW) */}
      {hasEEW && eewData && (
        <div className={styles.mobileEewBanner} role="alert">
          <div className={styles.mobileEewHeader}>
            <div className={styles.mobileEewHeaderTitle}>
              <AlertTriangle size={16} />
              <span>{eewData.Title || t('eew.title') || '긴급지진속보'}</span>
            </div>
            <button
              type="button"
              onClick={handleDismissEEW}
              className={styles.mobileCloseBtn}
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>

          <div className={styles.mobileEewBody}>
            {/* [1단계: 핵심 위험 정보 - 항상 크고 명확하게 표시] */}
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
              <span>{t('eew.seconds', { sec: waveStats.elapsedSec })}</span>
              <button
                type="button"
                className={styles.mobileEewToggleBtn}
                onClick={() => setShowTechDetails((prev) => !prev)}
                aria-label="기술 상세 정보 토글"
              >
                <span>{showTechDetails ? '상세 접기' : '파동·상세'}</span>
                {showTechDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {/* [2단계: 기술 정보 및 이동 버튼 - 접이식 영역] */}
            {showTechDetails && (
              <div className={styles.mobileEewTechArea}>
                <div className={styles.mobileEewWaveRow}>
                  <span className={styles.waveP}>P: {waveStats.pRadius}km</span>
                  <span className={styles.waveS}>S: {waveStats.sRadius}km</span>
                  <span>깊이: {eewData.Depth ?? '-'}km</span>
                </div>

                {eewData.Latitude && eewData.Longitude && (
                  <button
                    type="button"
                    className={styles.mobileFocusBtn}
                    onClick={() => onFocusEpicenter(eewData.Latitude, eewData.Longitude)}
                  >
                    <MapPin size={15} />
                    <span>{t('eew.focusEpicenter') || '진앙지 화면 중앙 맞춤'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. 실시간 흔들림 급증 감지 (Detection Alert) */}
      {detectionAlert && (
        <div className={styles.mobileDetectAlert} role="alert">
          <div className={styles.mobileDetectHeader}>
            <div className={styles.mobileEewHeaderTitle}>
              <AlertTriangle size={16} />
              <span>{t('detectAlert.title') || '흔들림 감지 알림'}</span>
            </div>
            <button
              type="button"
              onClick={handleDismissDetection}
              className={styles.mobileCloseBtn}
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
                <MapPin size={15} />
                <span>{t('detectAlert.focusMap') || '감지 위치로 이동'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

