import React from 'react';
import { useTranslation } from 'react-i18next';
import { EEWState } from '../WolfxEEWService';
import { FusionContext, FusionEEWData } from '../hooks/useEEWFusion';
import { WaveStats } from '../types';
import { translateRegionName } from '../translateUtils';
import { useGroundCondition } from '../hooks/useGroundCondition';
import styles from '../App.module.css';

interface EEWCardProps {
  eewContext: FusionContext;
  waveStats: WaveStats;
  handleDismissEEW: () => void;
}

export const EEWCard: React.FC<EEWCardProps> = ({ eewContext, waveStats, handleDismissEEW }) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const { state, data: activeEEW } = eewContext;

  const { groundData, loading } = useGroundCondition(activeEEW?.Latitude, activeEEW?.Longitude);

  if (!activeEEW) return null;

  const rawHypo = activeEEW.Hypocenter || '';
  const translatedHypo = translateRegionName(rawHypo, currentLang);
  
  const isFinal = state === EEWState.FINAL;
  const isCancelled = state === EEWState.CANCELLED;

  return (
    <div className={styles.eewCard}>
      <div className={styles.eewHeader}>
        <div className={styles.eewTitleBox}>
          {!isFinal && !isCancelled && <div className={styles.eewPulseDot} />}
          <span className={styles.eewTitle}>
            {isCancelled ? '지진속보 취소 (Cancelled)' : activeEEW.Title || t('eew.title')}
            {isFinal && ' [최종보]'}
          </span>
        </div>
        <button
          type="button"
          className={styles.eewCloseBtn}
          onClick={handleDismissEEW}
          title={t('eew.close')}
        >
          ✕
        </button>
      </div>
      <div className={styles.eewBody} style={{ opacity: isCancelled ? 0.6 : 1 }}>
        <div className={styles.eewHypocenterRow}>
          <div className={styles.eewHypoName}>
            {translatedHypo || t('eew.unknownEpicenter')}
            {rawHypo && rawHypo !== translatedHypo && (
              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px', fontWeight: 500 }}>
                ({rawHypo})
              </span>
            )}
          </div>
          {activeEEW.MaxIntensity && (
            <div className={styles.eewMaxIntBadge} style={{ backgroundColor: activeEEW.isCorrected ? '#ec4899' : undefined }}>
              {t('eew.maxIntensity', { scale: activeEEW.MaxIntensity })}
            </div>
          )}
        </div>
        <div className={styles.eewMetaGrid}>
          <div className={styles.eewMetaItem}>
            <span className={styles.metaLabel}>{t('eew.magnitude')}</span>
            <span className={styles.metaValue}>M{activeEEW.Magunitude ?? '-'}</span>
          </div>
          <div className={styles.eewMetaItem}>
            <span className={styles.metaLabel}>{t('eew.depth')}</span>
            <span className={styles.metaValue}>{activeEEW.Depth ?? '-'}km</span>
          </div>
          <div className={styles.eewMetaItem}>
            <span className={styles.metaLabel}>{t('eew.elapsed')}</span>
            <span className={styles.metaValue}>{t('eew.seconds', { sec: waveStats.elapsedSec })}</span>
          </div>
        </div>
        {!isCancelled && (
          <div className={styles.eewWaveStatus}>
            <div className={styles.waveRow}>
              <span className={styles.pWaveBadge}>
                <span className={styles.waveDotP} /> {t('eew.pWaveRadius')}
              </span>
              <span>{waveStats.pRadius} km</span>
            </div>
            <div className={styles.waveRow}>
              <span className={styles.sWaveBadge}>
                <span className={styles.waveDotS} /> {t('eew.sWaveRadius')}
              </span>
              <span>{waveStats.sRadius} km</span>
            </div>
          </div>
        )}
        
        {/* 지반 증폭률 / 마이크로 조닝 섹션 */}
        {!isCancelled && (
          <div className={styles.eewGroundSection}>
            <div className={styles.eewGroundHeader}>
              <span>진앙지 표층지반 증폭률 (Micro-zoning)</span>
              {loading && <span className={styles.eewGroundLoading}>조회 중...</span>}
            </div>
            {groundData ? (
              <div className={styles.eewGroundGrid}>
                <div>지형: {groundData.JNAME}</div>
                <div>Vs30: {groundData.AVS} m/s</div>
                <div className={styles.eewGroundRowFull}>
                  <span>ARV: {groundData.ARV}배</span>
                  <span className={parseFloat(groundData.ARV) >= 1.5 ? styles.eewGroundSoftBadge : styles.eewGroundHardBadge}>
                    {parseFloat(groundData.ARV) >= 1.5 ? '연약 지반' : '보통/단단한 지반'}
                  </span>
                </div>
              </div>
            ) : (
              !loading && <div className={styles.eewGroundEmpty}>해당 지역 지반 데이터를 가져올 수 없습니다.</div>
            )}
          </div>
        )}

        <div className={styles.eewTimeRow}>
          {t('eew.originTime')}: {activeEEW.OriginTime || '-'}
        </div>
      </div>
    </div>
  );
};
