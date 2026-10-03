import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDataSourceHealth, formatRelativeTime } from '../dataHealthService';
import styles from '../App.module.css';

/**
 * 실시간 데이터(kmoni) 수신이 지연/중단되면 지도 위에 항상 표시되는 경고 배지.
 * 정상 수신 중이거나 첫 수신 전(대기 상태)에는 렌더링하지 않는다.
 */
export const DataDelayBadge: React.FC = () => {
  const { t } = useTranslation();
  const healthMap = useDataSourceHealth();
  const kmoni = healthMap.kmoni;

  if (kmoni.status === 'online' || !kmoni.lastReceivedAt) return null;

  return (
    <div
      className={`${styles.dataDelayBadge} ${kmoni.status === 'offline' ? styles.dataDelayOffline : ''}`}
      role="status"
    >
      <span className={styles.dataDelayDot} />
      {t('dataDelay.title')} · {formatRelativeTime(kmoni.lastReceivedAt)}
    </div>
  );
};
