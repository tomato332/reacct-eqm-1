import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DataSourceType } from '../../types';
import { TopStationItem } from '../../QuakeDetectService';
import { P2PEarthquakeEvent, P2PObservationPoint } from '../../P2PQuakeService';
import { translateRegionName, translatePrefecture, formatObservationPointName } from '../../translateUtils';
import { ChevronUp, ChevronDown, MapPin, Activity, List, Info } from 'lucide-react';
import styles from './MobileView.module.css';

const JMA_SCALES = [
  { label: '7', color: '#7e22ce' },
  { label: '6+', color: '#991b1b', raw: '6강' },
  { label: '6-', color: '#dc2626', raw: '6약' },
  { label: '5+', color: '#ea580c', raw: '5강' },
  { label: '5-', color: '#f97316', raw: '5약' },
  { label: '4', color: '#eab308', textColor: '#000' },
  { label: '3', color: '#16a34a' },
  { label: '2', color: '#2563eb' },
  { label: '1', color: '#60a5fa' },
];

type SheetState = 'collapsed' | 'half' | 'full';

interface MobileBottomSheetProps {
  dataSource: DataSourceType;
  topStations: TopStationItem[];
  handleSelectStation: (s: TopStationItem) => void;
  currentP2PEvent: P2PEarthquakeEvent | null;
  historyP2PEvents: P2PEarthquakeEvent[];
  onSelectP2PEvent: (e: P2PEarthquakeEvent) => void;
  onFocusEpicenter: (lat: number, lon: number) => void;
  onFocusPoint: (p: P2PObservationPoint) => void;
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  dataSource,
  topStations,
  handleSelectStation,
  currentP2PEvent,
  historyP2PEvents,
  onSelectP2PEvent,
  onFocusEpicenter,
  onFocusPoint,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const [sheetState, setSheetState] = useState<SheetState>('collapsed');
  const [activeTab, setActiveTab] = useState<'intensity' | 'p2p' | 'legend'>(
    dataSource === 'p2pquake' ? 'p2p' : 'intensity'
  );
  const [selectedScaleFilter, setSelectedScaleFilter] = useState<number | null>(null);

  // DataSource가 바뀌면 자동으로 탭 맞춰주기
  React.useEffect(() => {
    if (dataSource === 'p2pquake') {
      setActiveTab('p2p');
    } else if (activeTab === 'p2p') {
      setActiveTab('intensity');
    }
  }, [dataSource]);

  // 드래그 터치 시작 Y 좌표
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - touchStartYRef.current;
    touchStartYRef.current = null;

    if (deltaY < -40) {
      // 위로 스와이프
      if (sheetState === 'collapsed') setSheetState('half');
      else if (sheetState === 'half') setSheetState('full');
    } else if (deltaY > 40) {
      // 아래로 스와이프
      if (sheetState === 'full') setSheetState('half');
      else if (sheetState === 'half') setSheetState('collapsed');
    }
  };

  const toggleExpand = () => {
    if (sheetState === 'collapsed') setSheetState('half');
    else setSheetState('collapsed');
  };

  // 피크 바에 노출할 텍스트 & 배지
  const top1Station = topStations[0];
  const maxIntensityFormatted = top1Station ? top1Station.jindoFormatted : '0.0';
  const maxStationName = top1Station
    ? `${translatePrefecture(top1Station.region, currentLang)} ${translateRegionName(top1Station.name, currentLang)}`
    : t('dashboard.waiting');

  const p2pEpicenterTranslated = currentP2PEvent
    ? translateRegionName(currentP2PEvent.hypocenter.name, currentLang)
    : t('p2p.unknownEpicenter');

  const sheetClass =
    sheetState === 'collapsed'
      ? styles.sheetCollapsed
      : sheetState === 'half'
      ? styles.sheetHalf
      : styles.sheetFull;

  return (
    <div className={`${styles.bottomSheetContainer} ${sheetClass}`}>
      {/* 1. 드래그 핸들 */}
      <div
        className={styles.sheetHandleRow}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={toggleExpand}
        aria-label="시트 높이 조절"
      >
        <div className={styles.sheetHandleBar} />
      </div>

      {/* 2. 접혀 있을 때의 요약 피크 바 */}
      {sheetState === 'collapsed' && (
        <div className={styles.sheetPeekBar} onClick={() => setSheetState('half')}>
          <div className={styles.sheetPeekLeft}>
            <span className={styles.peekDot} />
            <span className={styles.peekTitle}>
              {dataSource === 'p2pquake'
                ? `${t('p2p.title')}: ${p2pEpicenterTranslated}`
                : `${t('dashboard.maxNationwide')}: ${maxStationName}`}
            </span>
          </div>

          <div className={styles.sheetPeekRight}>
            {dataSource === 'p2pquake' && currentP2PEvent ? (
              <span
                className={styles.peekScaleBadge}
                style={{ backgroundColor: currentP2PEvent.maxScaleColor }}
              >
                {t('p2p.scale', { scale: currentP2PEvent.maxScaleStr })}
              </span>
            ) : top1Station ? (
              <span
                className={styles.peekScaleBadge}
                style={{ backgroundColor: top1Station.color }}
              >
                진도 {maxIntensityFormatted}
              </span>
            ) : null}
            <ChevronUp size={18} color="var(--text-muted)" />
          </div>
        </div>
      )}

      {/* 3. 펼쳐졌을 때의 탭 바 & 본문 스크롤 영역 */}
      {sheetState !== 'collapsed' && (
        <>
          <div className={styles.sheetTabBar} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'intensity'}
              className={`${styles.sheetTabItem} ${activeTab === 'intensity' ? styles.sheetTabItemActive : ''}`}
              onClick={() => setActiveTab('intensity')}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Activity size={14} />
                <span>{t('dashboard.tab') || t('dashboard.title') || '실시간 진도'}</span>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'p2p'}
              className={`${styles.sheetTabItem} ${activeTab === 'p2p' ? styles.sheetTabItemActive : ''}`}
              onClick={() => setActiveTab('p2p')}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <List size={14} />
                <span>{t('p2p.tab') || t('p2p.title') || '지진 정보'}</span>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'legend'}
              className={`${styles.sheetTabItem} ${activeTab === 'legend' ? styles.sheetTabItemActive : ''}`}
              onClick={() => setActiveTab('legend')}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Info size={14} />
                <span>{t('legend.title') || '범례'}</span>
              </div>
            </button>

            <button
              type="button"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 8px', color: 'var(--text-muted)' }}
              onClick={() => setSheetState('collapsed')}
              aria-label="시트 접기"
            >
              <ChevronDown size={18} />
            </button>
          </div>

          <div className={styles.sheetScrollContent}>
            {/* 탭 1: 실시간 진도 TOP 5 */}
            {activeTab === 'intensity' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <span>{t('dashboard.maxNationwide') || '전국 최대 계측진도'}</span>
                  <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {top1Station ? `${top1Station.jindoFormatted} (${top1Station.jindoStr})` : '-'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {topStations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('dashboard.loading')}
                    </div>
                  ) : (
                    topStations.map((stn, idx) => {
                      const transName = translateRegionName(stn.name || '', currentLang);
                      const transRegion = translatePrefecture(stn.region || '', currentLang);

                      return (
                        <div
                          key={stn.code}
                          className={styles.mobileStationRow}
                          onClick={() => {
                            handleSelectStation(stn);
                            setSheetState('half'); // 지도가 보이도록 half로 낮춤
                          }}
                        >
                          <div className={styles.mobileStationLeft}>
                            <div
                              className={styles.mobileRankBadge}
                              style={{
                                backgroundColor: idx === 0 ? 'rgba(234, 179, 8, 0.2)' : 'var(--surface)',
                                color: idx === 0 ? '#ca8a04' : 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {idx + 1}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span className={styles.mobileStationName}>{transName}</span>
                              <span className={styles.mobileStationRegion}>{transRegion}</span>
                            </div>
                          </div>

                          <div className={styles.mobileStationRight}>
                            <span className={styles.mobileJindoValue}>{stn.jindoFormatted}</span>
                            <span
                              className={styles.mobileJindoBadge}
                              style={{ backgroundColor: stn.color }}
                            >
                              {stn.jindoStr}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {/* 탭 2: P2P 지진 정보 */}
            {activeTab === 'p2p' && (
              <>
                {/* 최근 지진 가로 스크롤 칩 */}
                {historyP2PEvents.length > 0 && (
                  <div className={styles.mobileHistoryScroll}>
                    {historyP2PEvents.slice(0, 10).map((ev) => {
                      const isSelected = currentP2PEvent?.eventId === ev.eventId;
                      const epiName = translateRegionName(ev.hypocenter.name, currentLang);
                      return (
                        <div
                          key={ev.eventId}
                          className={`${styles.mobileHistoryChip} ${isSelected ? styles.mobileHistoryChipActive : ''}`}
                          onClick={() => onSelectP2PEvent(ev)}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 3,
                              backgroundColor: ev.maxScaleColor,
                              color: '#fff',
                              fontSize: 10,
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {ev.maxScaleStr}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {epiName || t('p2p.unknownEpicenter')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 현재 선택 지진 상세 배너 */}
                {currentP2PEvent ? (
                  <div className={styles.mobileP2PBanner}>
                    <div>
                      <div className={styles.mobileP2PEpicenter}>
                        {translateRegionName(currentP2PEvent.hypocenter.name, currentLang)}
                      </div>
                      <div className={styles.mobileP2PMeta}>
                        {currentP2PEvent.time} · M{currentP2PEvent.hypocenter.magnitude.toFixed(1)} · {currentP2PEvent.hypocenter.depth}km
                      </div>
                    </div>

                    <div
                      className={styles.mobileP2PMaxScale}
                      style={{ backgroundColor: currentP2PEvent.maxScaleColor }}
                    >
                      {currentP2PEvent.maxScaleStr}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('p2p.empty')}
                  </div>
                )}

                {currentP2PEvent && (
                  <button
                    type="button"
                    className={styles.mobileFocusBtn}
                    onClick={() => {
                      onFocusEpicenter(
                        currentP2PEvent.hypocenter.latitude,
                        currentP2PEvent.hypocenter.longitude
                      );
                      setSheetState('half');
                    }}
                  >
                    <MapPin size={16} />
                    <span>{t('p2p.focusEpicenter') || '진앙지 화면 중앙 맞춤'}</span>
                  </button>
                )}

                {/* 관측 지점 리스트 */}
                {currentP2PEvent && currentP2PEvent.points.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                      <span>
                        {t('p2p.filterPointsCount', {
                          count: selectedScaleFilter
                            ? currentP2PEvent.points.filter((pt) => pt.scale === selectedScaleFilter).length
                            : currentP2PEvent.points.length,
                          total: currentP2PEvent.points.length,
                        })}
                      </span>
                      {selectedScaleFilter && (
                        <button
                          type="button"
                          onClick={() => setSelectedScaleFilter(null)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        >
                          {t('p2p.all')}
                        </button>
                      )}
                    </div>

                    <div className={styles.mobilePointsContainer}>
                      {(selectedScaleFilter
                        ? currentP2PEvent.points.filter((pt) => pt.scale === selectedScaleFilter)
                        : currentP2PEvent.points
                      )
                        .slice(0, 30)
                        .map((pt, i) => {
                          const { fullTranslated } = formatObservationPointName(pt.pref, pt.name, currentLang);
                          return (
                            <div
                              key={`${pt.name}-${i}`}
                              className={styles.mobilePointItem}
                              onClick={() => {
                                onFocusPoint(pt);
                                setSheetState('half');
                              }}
                            >
                              <span className={styles.mobilePointName}>{fullTranslated}</span>
                              <span
                                className={styles.mobilePointScale}
                                style={{ backgroundColor: pt.color }}
                              >
                                {pt.scaleStr}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 탭 3: 범례 및 기호 안내 */}
            {activeTab === 'legend' && (
              <div className={styles.mobileLegendSection}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                  {t('legend.scaleTitle') || '일본 기상청(JMA) 진도 계급'}
                </div>

                <div className={styles.mobileScaleGrid}>
                  {JMA_SCALES.map((scale) => {
                    let displayLabel = scale.label;
                    if (currentLang.startsWith('ko') && scale.raw) displayLabel = scale.raw;
                    if (currentLang.startsWith('ja') && scale.raw) displayLabel = scale.raw.replace('강', '強').replace('약', '弱');
                    return (
                      <div
                        key={scale.label}
                        className={styles.mobileScaleCell}
                        style={{
                          backgroundColor: scale.color,
                          color: scale.textColor || '#ffffff',
                        }}
                      >
                        {displayLabel}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <div className={styles.mobileLegendRow}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #2563eb', backgroundColor: 'rgba(37,99,235,0.2)', display: 'inline-block' }} />
                    <span>P파 도달 예상선 (초동 지진파)</span>
                  </div>
                  <div className={styles.mobileLegendRow}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #ea580c', backgroundColor: 'rgba(234,88,12,0.2)', display: 'inline-block' }} />
                    <span>S파 도달 예상선 (주요 강한 흔들림 파)</span>
                  </div>
                  <div className={styles.mobileLegendRow}>
                    <span style={{ color: '#dc2626', fontWeight: 900, fontSize: 14 }}>✕</span>
                    <span>추정 진앙지 (Epicenter)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
