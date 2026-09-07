import { useState, useEffect } from 'react';
import { DataSourceHealth, HealthSourceId, SourceHealthStatus } from './types';

// 각 데이터 소스별 지연(delayed) 및 오프라인(offline) 판정 임계치 (ms)
const HEALTH_THRESHOLDS: Record<HealthSourceId, { delayed: number; offline: number }> = {
  kmoni: { delayed: 4500, offline: 15000 },
  wolfx: { delayed: 18000, offline: 45000 },
  p2p: { delayed: 45000, offline: 100000 },
  kma: { delayed: 120000, offline: 240000 },
};

export class DataHealthService {
  private static instance: DataHealthService;

  private healthMap: Record<HealthSourceId, DataSourceHealth> = {
    wolfx: {
      id: 'wolfx',
      name: 'Wolfx EEW',
      status: 'offline',
      lastReceivedAt: null,
      detail: '대기 중',
    },
    p2p: {
      id: 'p2p',
      name: 'P2P 지진정보',
      status: 'offline',
      lastReceivedAt: null,
      detail: '대기 중',
    },
    kmoni: {
      id: 'kmoni',
      name: '강진 모니터 (NIED)',
      status: 'offline',
      lastReceivedAt: null,
      detail: '대기 중',
    },
    kma: {
      id: 'kma',
      name: '기상청 (KMA)',
      status: 'offline',
      lastReceivedAt: null,
      detail: '대기 중',
    },
  };

  private listeners: Set<(map: Record<HealthSourceId, DataSourceHealth>) => void> = new Set();
  private checkTimer: number | null = null;

  private constructor() {
    this.startHealthCheckLoop();
  }

  public static getInstance(): DataHealthService {
    if (!DataHealthService.instance) {
      DataHealthService.instance = new DataHealthService();
    }
    return DataHealthService.instance;
  }

  public report(
    id: HealthSourceId,
    update: Partial<Omit<DataSourceHealth, 'id'>>
  ): void {
    const current = this.healthMap[id];
    if (!current) return;

    this.healthMap[id] = {
      ...current,
      ...update,
      lastReceivedAt: update.lastReceivedAt !== undefined ? update.lastReceivedAt : (update.status === 'online' ? Date.now() : current.lastReceivedAt),
    };

    this.notify();
  }

  public getHealthMap(): Record<HealthSourceId, DataSourceHealth> {
    return { ...this.healthMap };
  }

  public subscribe(listener: (map: Record<HealthSourceId, DataSourceHealth>) => void): () => void {
    this.listeners.add(listener);
    listener(this.getHealthMap());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const copy = this.getHealthMap();
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.error('[DataHealthService] Listener error:', err);
      }
    });
  }

  private startHealthCheckLoop(): void {
    if (typeof window === 'undefined') return;

    const loop = () => {
      const now = Date.now();
      let changed = false;

      (Object.keys(HEALTH_THRESHOLDS) as HealthSourceId[]).forEach((id) => {
        const item = this.healthMap[id];
        if (!item.lastReceivedAt) return;

        const elapsed = now - item.lastReceivedAt;
        const threshold = HEALTH_THRESHOLDS[id];

        let newStatus: SourceHealthStatus = item.status;
        if (elapsed > threshold.offline) {
          newStatus = 'offline';
        } else if (elapsed > threshold.delayed) {
          newStatus = 'delayed';
        }

        if (newStatus !== item.status) {
          this.healthMap[id] = { ...item, status: newStatus };
          changed = true;
        }
      });

      if (changed) {
        this.notify();
      }

      this.checkTimer = window.setTimeout(loop, 1000);
    };

    this.checkTimer = window.setTimeout(loop, 1000);
  }

  public destroy(): void {
    if (this.checkTimer) {
      window.clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    this.listeners.clear();
  }
}

export const dataHealthService = DataHealthService.getInstance();

/**
 * 상대 시간 포맷 헬퍼 (다국어 지원)
 */
export function formatRelativeTime(
  timestamp: number | null,
  lang: string = 'ko'
): string {
  if (!timestamp) {
    if (lang.startsWith('en')) return 'Pending';
    if (lang.startsWith('ja')) return '待機中';
    return '수신 대기';
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 3) {
    if (lang.startsWith('en')) return 'Just now';
    if (lang.startsWith('ja')) return 'たった今';
    return '방금 전';
  }

  if (diffSec < 60) {
    if (lang.startsWith('en')) return `${diffSec}s ago`;
    if (lang.startsWith('ja')) return `${diffSec}秒前`;
    return `${diffSec}초 전`;
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    if (lang.startsWith('en')) return `${diffMin}m ago`;
    if (lang.startsWith('ja')) return `${diffMin}分前`;
    return `${diffMin}분 전`;
  }

  const diffHour = Math.floor(diffMin / 60);
  if (lang.startsWith('en')) return `${diffHour}h ago`;
  if (lang.startsWith('ja')) return `${diffHour}時間前`;
  return `${diffHour}시간 전`;
}

/**
 * React 훅: 1초마다 갱신되는 실시간 데이터 소스 헬스 상태 반환
 */
export function useDataSourceHealth() {
  const [healthMap, setHealthMap] = useState<Record<HealthSourceId, DataSourceHealth>>(() =>
    dataHealthService.getHealthMap()
  );
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = dataHealthService.subscribe((newMap) => {
      setHealthMap(newMap);
    });

    // 1초마다 상대 시간 계산 갱신을 위해 틱 발생
    const ticker = setInterval(() => {
      setTick((prev) => (prev + 1) % 10000);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(ticker);
    };
  }, []);

  return healthMap;
}
