import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, AlertTriangle, Activity, WifiOff, Radio, ChevronDown, ChevronUp } from 'lucide-react';
import { SystemAlertStatus } from '../types';
import { useDataSourceHealth, formatRelativeTime } from '../dataHealthService';
import styles from './mobile/MobileView.module.css';

interface SystemStatusCardProps {
  hasActiveAlert?: boolean;
  alertStatus?: SystemAlertStatus;
  alertTitle?: string;
  defaultExpanded?: boolean;
}

export const SystemStatusCard: React.FC<SystemStatusCardProps> = ({
  hasActiveAlert = false,
  alertStatus,
  alertTitle,
  defaultExpanded = true,
}) => {
  const { t, i18n } = useTranslation();
  const healthMap = useDataSourceHealth();
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  // 데이터 소스 목록
  const sources = [
    healthMap.wolfx,
    healthMap.p2p,
    healthMap.kmoni,
    healthMap.kma,
  ];

  // 유효한 수신 타임스탬프 중 최신 시각 산출
  const validTimestamps = sources
    .map((s) => s.lastReceivedAt)
    .filter((ts): ts is number => typeof ts === 'number');

  const latestReceivedAt = validTimestamps.length > 0 ? Math.max(...validTimestamps) : null;

  // 전체 정상 소스 개수 계산
  const onlineCount = sources.filter((s) => s.status === 'online').length;
  const delayedCount = sources.filter((s) => s.status === 'delayed').length;
  const totalCount = sources.length;

  // 종합 시스템 상태 결정
  let resolvedStatus: SystemAlertStatus = 'normal';
  if (alertStatus) {
    resolvedStatus = alertStatus;
  } else if (hasActiveAlert) {
    resolvedStatus = 'detecting';
  } else if (onlineCount === 0 && delayedCount === 0) {
    resolvedStatus = 'offline';
  } else if (delayedCount > 0 && onlineCount === 0) {
    resolvedStatus = 'detecting';
  } else {
    resolvedStatus = 'normal';
  }

  // 상태별 아이콘 및 텍스트 매핑
  const renderStatusHeader = () => {
    switch (resolvedStatus) {
      case 'critical':
        return (
          <>
            <span className={`${styles.statusLiveDot} ${styles.liveDotOffline}`} />
            <AlertTriangle size={16} />
            <span>{alertTitle || t('systemStatus.critical')}</span>
          </>
        );
      case 'warning':
        return (
          <>
            <span className={`${styles.statusLiveDot} ${styles.liveDotDelayed}`} />
            <AlertTriangle size={16} />
            <span>{alertTitle || t('systemStatus.warning')}</span>
          </>
        );
      case 'detecting':
        return (
          <>
            <span className={`${styles.statusLiveDot} ${styles.liveDotDelayed}`} />
            <Activity size={16} />
            <span>{alertTitle || t('systemStatus.detecting')}</span>
          </>
        );
      case 'offline':
        return (
          <>
            <span className={`${styles.statusLiveDot} ${styles.liveDotOffline}`} />
            <WifiOff size={16} />
            <span>{t('systemStatus.offline')}</span>
          </>
        );
      case 'normal':
      default:
        return (
          <>
            <span className={`${styles.statusLiveDot} ${styles.liveDotOnline}`} />
            <ShieldCheck size={16} />
            <span>{t('systemStatus.normal')}</span>
          </>
        );
    }
  };

  const getStatusTitleClass = () => {
    switch (resolvedStatus) {
      case 'critical':
        return styles.statusCritical;
      case 'warning':
        return styles.statusWarning;
      case 'detecting':
        return styles.statusDetecting;
      case 'offline':
        return styles.statusOffline;
      case 'normal':
      default:
        return styles.statusNormal;
    }
  };

  const formattedSyncTime = latestReceivedAt
    ? `${new Date(latestReceivedAt).toTimeString().slice(0, 8)} (${formatRelativeTime(latestReceivedAt, i18n.language)})`
    : t('systemStatus.statusLabels.offline');

  return (
    <div className={styles.systemStatusCard}>
      {/* 1. 상단 상태 요약 헤더 */}
      <div className={styles.systemStatusHeader}>
        <div className={`${styles.systemStatusTitle} ${getStatusTitleClass()}`}>
          {renderStatusHeader()}
        </div>
        <span className={styles.systemUpdateTime} title={latestReceivedAt ? new Date(latestReceivedAt).toISOString() : ''}>
          {t('systemStatus.lastUpdate')}: {formattedSyncTime}
        </span>
      </div>

      {/* 2. 경보 요약 텍스트 */}
      <div className={styles.statusSummaryNotice}>
        {hasActiveAlert
          ? (alertTitle || t('detectAlert.activeNotice'))
          : t('systemStatus.noAlerts')}
      </div>

      {/* 3. 데이터 소스 접기/펼치기 토글 바 */}
      <div className={styles.sourceToggleRow}>
        <button
          type="button"
          className={styles.sourceToggleBtn}
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          <span>{t('systemStatus.toggleSources')}</span>
          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        <span
          className={
            onlineCount === totalCount
              ? styles.sourceSummaryBadge
              : styles.sourceSummaryBadgeWarn
          }
        >
          {onlineCount === totalCount
            ? `${t('systemStatus.allOnline')} (${onlineCount}/${totalCount})`
            : `${onlineCount}/${totalCount} ${t('systemStatus.connected')}`}
        </span>
      </div>

      {/* 4. 데이터 소스 4종 실시간 상태 상세 목록 */}
      {isExpanded && (
        <div className={styles.systemSourceGrid}>
          {sources.map((src) => {
            const relTime = formatRelativeTime(src.lastReceivedAt, i18n.language);
            const isOnline = src.status === 'online';
            const isDelayed = src.status === 'delayed';

            const badgeClass = isOnline
              ? styles.statusBadgeOnline
              : isDelayed
              ? styles.statusBadgeDelayed
              : styles.statusBadgeOffline;

            const dotClass = isOnline
              ? styles.liveDotOnline
              : isDelayed
              ? styles.liveDotDelayed
              : styles.liveDotOffline;

            const labelKey = src.status as 'online' | 'delayed' | 'offline';
            const statusLabel = t(`systemStatus.statusLabels.${labelKey}`) || src.status;

            return (
              <div key={src.id} className={styles.systemSourceItem}>
                <div className={styles.sourceItemTop}>
                  <div className={styles.sourceItemLeft}>
                    <Radio size={12} style={{ color: 'var(--text-muted)' }} />
                    <span>{t(`systemStatus.sources.${src.id}`) || src.name}</span>
                  </div>
                  <div className={`${styles.sourceItemStatusBadge} ${badgeClass}`}>
                    <span className={`${styles.statusLiveDot} ${dotClass}`} style={{ width: 6, height: 6 }} />
                    <span>{statusLabel} · {relTime}</span>
                  </div>
                </div>
                {src.detail && (
                  <div className={styles.sourceItemDetail}>
                    {src.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
