import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { P2PEarthquakeEvent, P2PObservationPoint } from '../P2PQuakeService';
import { translateRegionName, translatePrefecture } from '../translateUtils';
import styles from '../App.module.css';

interface P2PQuakeCardProps {
  currentEvent: P2PEarthquakeEvent | null;
  historyEvents: P2PEarthquakeEvent[];
  onSelectEvent: (event: P2PEarthquakeEvent) => void;
  onFocusEpicenter: (lat: number, lon: number) => void;
  onFocusPoint: (point: P2PObservationPoint) => void;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  listOnly?: boolean;
}

export const P2PQuakeCard: React.FC<P2PQuakeCardProps> = ({
  currentEvent,
  historyEvents,
  onSelectEvent,
  onFocusEpicenter,
  onFocusPoint,
  isCollapsed,
  setIsCollapsed,
  listOnly = false,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [selectedIntensityFilter, setSelectedIntensityFilter] = useState<number | null>(null);

  const formatScaleText = (scaleStr: string): string => {
    if (currentLang.startsWith('en')) {
      return scaleStr.replace('강', '+').replace('약', '-');
    }
    if (currentLang.startsWith('ja') || currentLang.startsWith('jp')) {
      return scaleStr.replace('강', '強').replace('약', '弱');
    }
    return scaleStr;
  };

  const getTsunamiText = (tsunami: string): string => {
    if (tsunami.includes('걱정') || tsunami.includes('None') || tsunami.includes('心配')) {
      return t('p2p.tsunamiNone');
    }
    if (tsunami.includes('조사') || tsunami.includes('Unknown') || tsunami.includes('調査')) {
      return t('p2p.tsunamiUnknown');
    }
    if (tsunami.includes('경보') || tsunami.includes('주의보') || tsunami.includes('Warning') || tsunami.includes('警報')) {
      return t('p2p.tsunamiWarning');
    }
    return tsunami;
  };

  if (!currentEvent && !listOnly) {
    return (
      <div className={styles.p2pCardContainer}>
        <div className={styles.p2pCardHeader}>
          <div className={styles.p2pHeaderTitle}>
            <span className={styles.p2pStatusDot} />
            <span>{t('p2p.title')}</span>
          </div>
        </div>
        <div className={styles.p2pCardBody}>
          <div className={styles.p2pEmptyText}>{t('dashboard.loading')}</div>
        </div>
      </div>
    );
  }

  // listOnly인데 내역조차 없으면 아예 렌더링하지 않음
  if (listOnly && historyEvents.length === 0) {
    return null;
  }

  const rawEpicenter = currentEvent?.hypocenter.name || '';
  const translatedEpicenter = translateRegionName(rawEpicenter, currentLang);
  const formattedMaxScale = currentEvent ? formatScaleText(currentEvent.maxScaleStr) : '';

  if (isCollapsed && !listOnly && currentEvent) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={styles.collapsedP2PBadge}
        onClick={() => setIsCollapsed(false)}
        onKeyDown={(e) => e.key === 'Enter' && setIsCollapsed(false)}
        title={t('p2p.title')}
      >
        <span className={styles.p2pStatusDot} />
        <span className={styles.collapsedP2PTitle}>
          {translatedEpicenter || t('p2p.unknownEpicenter')}
        </span>
        <span
          className={styles.p2pScaleBadge}
          style={{ backgroundColor: currentEvent.maxScaleColor }}
        >
          {t('p2p.scale', { scale: formattedMaxScale })}
        </span>
      </div>
    );
  }

  // Group observation points by intensity
  const scaleGroups: Record<number, P2PObservationPoint[]> = {};
  if (currentEvent) {
    currentEvent.points.forEach((pt) => {
      if (!scaleGroups[pt.scale]) scaleGroups[pt.scale] = [];
      scaleGroups[pt.scale].push(pt);
    });
  }

  const sortedScales = Object.keys(scaleGroups)
    .map(Number)
    .sort((a, b) => b - a);

  const displayedPoints = selectedIntensityFilter && currentEvent
    ? currentEvent.points.filter((pt) => pt.scale === selectedIntensityFilter)
    : (currentEvent?.points || []);

  return (
    <div className={styles.p2pCardContainer}>
      {/* Header */}
      <div className={styles.p2pCardHeader}>
        <div className={styles.p2pHeaderTitle}>
          <span className={styles.p2pStatusDot} />
          <span className={styles.p2pMainTitle}>{t('p2p.title')}</span>
          <span className={styles.p2pCodeTag}>Code 551</span>
        </div>
        {!listOnly && (
          <button
            type="button"
            className={styles.p2pCollapseBtn}
            onClick={() => setIsCollapsed(true)}
            title="Collapse"
          >
            {currentLang.startsWith('en') ? 'Collapse ▾' : currentLang.startsWith('ja') ? '閉じる ▾' : '접기 ▾'}
          </button>
        )}
      </div>

      {/* History Selector (if multiple events exist) */}
      {/* Recent History (Simple Horizontal List) */}
      {(historyEvents.length > 1 || listOnly) && (
        <div className={styles.p2pHistoryList}>
          <div className={styles.p2pHistoryLabel}>
            {currentLang.startsWith('en') ? 'Recent:' : currentLang.startsWith('ja') ? '最近の履歴:' : '최근 이력:'}
          </div>
          <div className={styles.p2pHistoryScroll}>
            {historyEvents.map((h) => {
              const hTrans = translateRegionName(h.hypocenter.name || '', currentLang);
              const hScale = formatScaleText(h.maxScaleStr);
              const isSelected = h.eventId === currentEvent?.eventId;
              return (
                <button
                  key={h.eventId}
                  className={`${styles.p2pHistoryItem} ${isSelected ? styles.p2pHistoryItemSelected : ''}`}
                  onClick={() => onSelectEvent(h)}
                >
                  <span className={styles.p2pHistoryItemScale} style={{ backgroundColor: h.maxScaleColor }}>
                    {hScale}
                  </span>
                  <div className={styles.p2pHistoryItemInfo}>
                    <span className={styles.p2pHistoryItemTime}>{h.time.substring(5, 16)}</span>
                    <span className={styles.p2pHistoryItemName}>{hTrans}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Body */}
      {!listOnly && currentEvent && (
        <div className={styles.p2pCardBody}>
          {/* Top Summary Banner */}
        <div className={styles.p2pSummaryBanner}>
          <div className={styles.p2pEpicenterMain}>
            <div className={styles.p2pEpicenterName}>
              {translatedEpicenter || t('p2p.unknownEpicenter')}
              {rawEpicenter && rawEpicenter !== translatedEpicenter && (
                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px', fontWeight: 500 }}>
                  ({rawEpicenter})
                </span>
              )}
            </div>
            <div className={styles.p2pEpicenterMeta}>
              {t('p2p.originTime')}: {currentEvent.time} | {t('p2p.depth')}: {currentEvent.hypocenter.depth > 0 ? `${currentEvent.hypocenter.depth}km` : t('p2p.veryShallow')} | {t('p2p.magnitude')}: M{currentEvent.hypocenter.magnitude > 0 ? currentEvent.hypocenter.magnitude.toFixed(1) : '-'}
            </div>
          </div>
          <div className={styles.p2pMaxScaleBox}>
            <div className={styles.p2pMaxScaleLabel}>{t('p2p.maxIntensity')}</div>
            <div
              className={styles.p2pMaxScaleValue}
              style={{ backgroundColor: currentEvent.maxScaleColor }}
            >
              {formattedMaxScale}
            </div>
          </div>
        </div>

        {/* Tsunami Status Banner */}
        <div className={styles.p2pTsunamiBanner}>
          <span className={styles.p2pTsunamiIcon}>🌊</span>
          <span className={styles.p2pTsunamiText}>{getTsunamiText(currentEvent.tsunami)}</span>
        </div>

        {/* Quick Action Button */}
        {currentEvent.hypocenter.latitude !== 0 && (
          <button
            type="button"
            className={styles.p2pFocusBtn}
            onClick={() =>
              onFocusEpicenter(
                currentEvent.hypocenter.latitude,
                currentEvent.hypocenter.longitude
              )
            }
          >
            🎯 {currentLang.startsWith('en') ? 'Focus Epicenter' : currentLang.startsWith('ja') ? '震源地にフォーカス' : '진원지 화면 중앙 맞춤'}
          </button>
        )}

        {/* Observation Intensity Filter Chips */}
        {sortedScales.length > 0 && (
          <div className={styles.p2pFilterSection}>
            <div className={styles.p2pSectionLabel}>
              {t('p2p.filterPointsCount', {
                count: displayedPoints.length,
                total: currentEvent.points.length,
              })}
            </div>
            <div className={styles.p2pScaleChipsRow}>
              <button
                type="button"
                className={`${styles.p2pScaleChip} ${selectedIntensityFilter === null ? styles.p2pScaleChipActive : ''}`}
                onClick={() => setSelectedIntensityFilter(null)}
              >
                {t('p2p.all')} ({currentEvent.points.length})
              </button>
              {sortedScales.map((scale) => {
                const count = scaleGroups[scale]?.length || 0;
                const samplePt = scaleGroups[scale]?.[0];
                const isActive = selectedIntensityFilter === scale;
                const chipScaleStr = formatScaleText(samplePt?.scaleStr || String(scale));
                return (
                  <button
                    key={scale}
                    type="button"
                    className={`${styles.p2pScaleChip} ${isActive ? styles.p2pScaleChipActive : ''}`}
                    style={
                      isActive && samplePt
                        ? { backgroundColor: samplePt.color, color: '#ffffff', borderColor: samplePt.color }
                        : undefined
                    }
                    onClick={() =>
                      setSelectedIntensityFilter(selectedIntensityFilter === scale ? null : scale)
                    }
                  >
                    {t('p2p.scale', { scale: chipScaleStr })} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Observation Points List */}
        {displayedPoints.length > 0 && (
          <div className={styles.p2pPointsList}>
            {displayedPoints.slice(0, 30).map((pt, idx) => {
              const prefTrans = translatePrefecture(pt.pref, currentLang);
              const nameTrans = translateRegionName(pt.name, currentLang);
              const ptScaleStr = formatScaleText(pt.scaleStr);
              return (
                <div
                  key={`${pt.pref}-${pt.name}-${idx}`}
                  role="button"
                  tabIndex={0}
                  className={styles.p2pPointItem}
                  onClick={() => onFocusPoint(pt)}
                  onKeyDown={(e) => e.key === 'Enter' && onFocusPoint(pt)}
                  title={t('p2p.clickToFocus')}
                >
                  <div className={styles.p2pPointInfo}>
                    <span className={styles.p2pPointPref}>{prefTrans || pt.pref}</span>
                    <span className={styles.p2pPointName}>{nameTrans || pt.name}</span>
                  </div>
                  <span
                    className={styles.p2pPointScaleBadge}
                    style={{ backgroundColor: pt.color }}
                  >
                    {t('p2p.scale', { scale: ptScaleStr })}
                  </span>
                </div>
              );
            })}
            {displayedPoints.length > 30 && (
              <div className={styles.p2pMorePoints}>
                {t('p2p.morePointsCount', { count: displayedPoints.length - 30 })}
              </div>
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );
};
