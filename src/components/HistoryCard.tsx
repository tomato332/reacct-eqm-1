import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, MapPin } from 'lucide-react';
import { getExactJindoColor } from '../colorMap';
import { formatJSTDateTime } from '../utils';
import styles from '../App.module.css';

// 서버(DetectedEventHistoryEntry)와 동일한 구조. 타입만 필요하므로 로컬 정의한다.
interface HistoryEntry {
  id: number;
  startTs: number;
  endTs: number;
  durationSec: number;
  maxJindo: number | null;
  maxJindoStr: string;
  region: string | null;
  stationName: string | null;
  center: [number, number] | null;
  frameCount: number;
  animation: string | null;
}

interface HistoryCardProps {
  onFocusEpicenter: (lat: number, lon: number) => void;
}

/**
 * 서버에 저장된 감지 이벤트 히스토리(GET /api/history) 목록 카드.
 * 기록이 없으면 렌더링하지 않는다.
 */
export const HistoryCard: React.FC<HistoryCardProps> = ({ onFocusEpicenter }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setItems(Array.isArray(json?.items) ? json.items : []);
        setLoadFailed(false);
      }
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const timer = setInterval(fetchHistory, 60000);
    return () => clearInterval(timer);
  }, [fetchHistory]);

  if (items !== null && items.length === 0) return null;

  return (
    <div className={styles.p2pCardContainer}>
      <div className={styles.p2pCardHeader}>
        <div className={styles.p2pHeaderTitle}>
          <span className={styles.p2pStatusDot} />
          <span className={styles.p2pMainTitle}>{t('history.title')}</span>
        </div>
      </div>
      <div className={styles.historyList}>
        {items === null && !loadFailed && (
          <div className={styles.historyEmpty}>{t('dashboard.loading')}</div>
        )}
        {loadFailed && items === null && (
          <div className={styles.historyEmpty}>{t('history.loadFailed')}</div>
        )}
        {(items ?? []).slice(0, 20).map((e) => (
          <div
            key={e.id}
            className={`${styles.historyItem} ${e.center ? styles.historyItemClickable : ''}`}
            role={e.center ? 'button' : undefined}
            tabIndex={e.center ? 0 : undefined}
            onClick={e.center ? () => onFocusEpicenter(e.center![1], e.center![0]) : undefined}
            onKeyDown={e.center ? (ev) => ev.key === 'Enter' && onFocusEpicenter(e.center![1], e.center![0]) : undefined}
          >
            <span className={styles.historyBadge} style={{ backgroundColor: getExactJindoColor(e.maxJindo) }}>
              {e.maxJindoStr}
            </span>
            <div className={styles.historyInfo}>
              <span className={styles.historyRegion}>
                {e.region ? `${e.region} ${e.stationName ?? ''}`.trim() : t('history.empty')}
                {e.center && <MapPin size={11} className={styles.historyPin} />}
              </span>
              <span className={styles.historyMeta}>
                {formatJSTDateTime(new Date(e.startTs))} · {t('history.duration', { sec: e.durationSec })}
              </span>
            </div>
            {e.animation && (
              <a
                className={styles.historyVideoLink}
                href={`/api/history/${e.id}/animation`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                title={t('history.video')}
              >
                <Film size={14} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
