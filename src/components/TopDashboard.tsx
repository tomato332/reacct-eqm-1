import React from 'react';
import { useTranslation } from 'react-i18next';
import { DataSourceType } from '../types';
import { TopStationItem } from '../QuakeDetectService';
import { translateRegionName, translatePrefecture } from '../translateUtils';
import styles from '../App.module.css';

interface TopDashboardProps {
  isTopCollapsed: boolean;
  setIsTopCollapsed: (v: boolean) => void;
  dataSource: DataSourceType;
  topStations: TopStationItem[];
  handleSelectStation: (s: TopStationItem) => void;
}

export const TopDashboard: React.FC<TopDashboardProps> = ({
  isTopCollapsed,
  setIsTopCollapsed,
  dataSource,
  topStations,
  handleSelectStation,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const getSourceShort = () => {
    if (dataSource === 'kmoni') return 'NIED';
    return 'Yahoo!';
  };

  const titleText = currentLang.startsWith('en')
    ? `Live Intensity TOP 5 (${getSourceShort()})`
    : currentLang.startsWith('ja')
    ? `リアルタイム震度 TOP 5 (${getSourceShort()})`
    : `실시간 진도 TOP 5 (${getSourceShort()})`;

  const collapseText = currentLang.startsWith('en')
    ? 'Collapse ▾'
    : currentLang.startsWith('ja')
    ? '閉じる ▾'
    : '접기 ▾';

  const footerLabel = currentLang.startsWith('en')
    ? 'Max Shaking Nationwide'
    : currentLang.startsWith('ja')
    ? '全国最大観測震度'
    : '전국 최고 진도';

  if (isTopCollapsed) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={styles.collapsedDashboardBadge}
        onClick={() => setIsTopCollapsed(false)}
        onKeyDown={(e) => e.key === 'Enter' && setIsTopCollapsed(false)}
        title={titleText}
      >
        <span className={styles.liveSignalDot} />
        <span>{titleText}</span>
        {topStations.length > 0 && (
          <span className={styles.jindoBadge} style={{ backgroundColor: topStations[0].color }}>
            1: {topStations[0].jindoFormatted}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={styles.topDashboard}>
      <div className={styles.dashboardHeader}>
        <div className={styles.dashboardTitleBox}>
          <span className={styles.liveSignalDot} />
          <span>{titleText}</span>
        </div>
        <button
          type="button"
          className={styles.dashboardToggleBtn}
          onClick={() => setIsTopCollapsed(true)}
          title="Collapse"
        >
          {collapseText}
        </button>
      </div>

      <div className={styles.dashboardBody}>
        {topStations.length === 0 ? (
          <div className={styles.loadingPlaceholder}>
            {t('dashboard.loading')}
          </div>
        ) : (
          topStations.map((stn) => {
            const transName = translateRegionName(stn.name || '', currentLang);
            const transRegion = translatePrefecture(stn.region || '', currentLang);

            return (
              <div
                key={stn.code}
                role="button"
                tabIndex={0}
                className={styles.topStationRow}
                onClick={() => handleSelectStation(stn)}
                onKeyDown={(e) => e.key === 'Enter' && handleSelectStation(stn)}
                title={`${stn.fullName} (${stn.jindoFormatted}) - ${t('dashboard.clickToFocus')}`}
              >
                <div className={styles.stationLeft}>
                  <div className={`${styles.rankBadge} ${stn.rank === 1 ? styles.rank1 : styles.rank2}`}>
                    {stn.rank}
                  </div>
                  <div className={styles.stationDetails}>
                    <span className={styles.stationNameText}>{transName || stn.name}</span>
                    {(transRegion || stn.region) && (
                      <span className={styles.stationRegionText}>{transRegion || stn.region}</span>
                    )}
                  </div>
                </div>
                <div className={styles.intensityRight}>
                  <span className={styles.jindoBadge} style={{ backgroundColor: stn.color }}>
                    {stn.jindoStr}
                  </span>
                  <span className={styles.jindoValue}>
                    {stn.jindoFormatted}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {topStations.length > 0 && (
        <div className={styles.dashboardFooter}>
          <span>{footerLabel}</span>
          <span className={styles.maxIntHighlight}>
            {topStations[0].jindoStr} ({topStations[0].jindoFormatted})
          </span>
        </div>
      )}
    </div>
  );
};
