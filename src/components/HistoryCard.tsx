import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, MapPin, Play } from 'lucide-react';
import { getExactJindoColor } from '../colorMap';
import { formatJSTDateTime } from '../utils';
import { HistoryEntry } from '../types';
import styles from '../App.module.css';

interface HistoryCardProps {
  onFocusEpicenter: (lat: number, lon: number) => void;
  onReplay: (entry: HistoryEntry) => void;
}

/**
 * 서버에 저장된 감지 이벤트 히스토리(GET /api/history) 목록 카드.
 * 기록이 없으면 렌더링하지 않는다. 리플레이 데이터가 있는 항목은 클릭 시 리플레이를 연다.
 */
export const HistoryCard: React.FC<HistoryCardProps> = ({ onFocusEpicenter, onReplay }) => {
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
    // 30초 폴링 + 감지 종료 이벤트 수신 시 즉시 갱신
    const timer = setInterval(fetchHistory, 30000);
    const onDetectionFinished = () => {
      // 서버가 기록을 저장할 시간을 두고 두 번 확인한다
      setTimeout(fetchHistory, 2000);
      setTimeout(fetchHistory, 6000);
    };
    window.addEventListener('eqm-detection-finished', onDetectionFinished);
    return () => {
      clearInterval(timer);
      window.removeEventListener('eqm-detection-finished', onDetectionFinished);
    };
  }, [fetchHistory]);

  if (items !== null && items.length === 0) return null;

  const handleItemClick = (e: HistoryEntry) => {
    if (e.replay) {
      onReplay(e);
    } else if (e.center) {
      onFocusEpicenter(e.center[1], e.center[0]);
    }
  };

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
            className={`${styles.historyItem} ${e.replay || e.center ? styles.historyItemClickable : ''}`}
            role={e.replay || e.center ? 'button' : undefined}
            tabIndex={e.replay || e.center ? 0 : undefined}
            onClick={() => handleItemClick(e)}
            onKeyDown={(ev) => ev.key === 'Enter' && handleItemClick(e)}
            title={e.replay ? t('history.replay') : undefined}
          >
            <span className={styles.historyBadge} style={{ backgroundColor: getExactJindoColor(e.maxJindo) }}>
              {e.maxJindoStr}
            </span>
            <div className={styles.historyInfo}>
              <span className={styles.historyRegion}>
                {e.region ? `${e.region} ${e.stationName ?? ''}`.trim() : t('history.empty')}
                {e.replay ? <Play size={11} className={styles.historyPin} /> : e.center ? <MapPin size={11} className={styles.historyPin} /> : null}
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
