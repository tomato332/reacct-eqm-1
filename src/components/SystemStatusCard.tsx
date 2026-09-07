import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Radio } from 'lucide-react';
import styles from './mobile/MobileView.module.css';

interface SystemStatusCardProps {
  hasActiveAlert?: boolean;
}

export const SystemStatusCard: React.FC<SystemStatusCardProps> = ({ hasActiveAlert = false }) => {
  const { t } = useTranslation();
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setLastSyncTime(`${hh}:${mm}:${ss}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.systemStatusCard}>
      <div className={styles.systemStatusHeader}>
        <div className={styles.systemStatusTitle}>
          <div className={styles.statusLiveDot} />
          <ShieldCheck size={16} />
          <span>{hasActiveAlert ? t('dashboard.detecting') : t('systemStatus.normal')}</span>
        </div>
        <span className={styles.systemUpdateTime}>
          {t('systemStatus.lastUpdate')}: {lastSyncTime}
        </span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {hasActiveAlert ? t('detectAlert.activeNotice') : t('systemStatus.noAlerts')}
      </div>

      <div className={styles.systemSourceGrid}>
        <div className={styles.systemSourceItem}>
          <span className={styles.systemSourceDot} />
          <Radio size={12} />
          <span>{t('systemStatus.sources.wolfx')}</span>
        </div>
        <div className={styles.systemSourceItem}>
          <span className={styles.systemSourceDot} />
          <Radio size={12} />
          <span>{t('systemStatus.sources.p2p')}</span>
        </div>
        <div className={styles.systemSourceItem}>
          <span className={styles.systemSourceDot} />
          <Radio size={12} />
          <span>{t('systemStatus.sources.kmoni')}</span>
        </div>
        <div className={styles.systemSourceItem}>
          <span className={styles.systemSourceDot} />
          <Radio size={12} />
          <span>{t('systemStatus.sources.kma')}</span>
        </div>
      </div>
    </div>
  );
};
