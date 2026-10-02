import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, X } from 'lucide-react';
import { getExactJindoColor } from '../colorMap';
import { HistoryEntry, MapRendererController } from '../types';
import styles from '../App.module.css';

interface ReplayData {
  version: number;
  intervalSec: number;
  startTs: number;
  times: string[];
  frames: { i: Record<string, number>; g: any }[];
}

interface ReplayStationMeta {
  Code: string;
  Location?: { latitude: number; longitude: number };
}

// 관측소 목록은 방문마다 바뀌지 않으므로 모듈 단위로 캐시
let stationCache: ReplayStationMeta[] | null = null;

/** "YYYYMMDDHHMMSS" → "MM/DD HH:MM:SS" (JST 고정) */
const formatFrameTime = (timeStr: string): string => {
  if (timeStr.length !== 14) return timeStr;
  return `${timeStr.slice(4, 6)}/${timeStr.slice(6, 8)} ${timeStr.slice(8, 10)}:${timeStr.slice(10, 12)}:${timeStr.slice(12, 14)}`;
};

interface ReplayViewerProps {
  entry: HistoryEntry;
  // maplibregl.Map 인스턴스 (지도 소스 직접 제어용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any | null;
  // 리플레이 모드 토글용 컨트롤러
  mapController: MapRendererController | null;
  onClose: () => void;
  // 리플레이 데이터가 없는 등 실패 시 부모가 카메라를 복구할 수 있도록 알림
  onReady?: (ok: boolean) => void;
}

/**
 * 감지 이벤트 리플레이 뷰어. 프레임별 진도 데이터를 실제 지도의 진도 점/감지 격자 레이어에
 * 초당 1프레임으로 흘려보내 실시간처럼 되감아 본다. 재생 중에는 실시간 업데이트가 지도를 덮어쓰지 않는다.
 */
export const ReplayViewer: React.FC<ReplayViewerProps> = ({ entry, map, mapController, onClose, onReady }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ReplayData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const featuresRef = useRef<any[] | null>(null);
  const codeIndexRef = useRef<Map<string, any> | null>(null);

  // 프레임 데이터를 지도에 반영
  const applyFrame = useCallback((idx: number, replay: ReplayData | null, features: any[] | null) => {
    if (!replay || !features) return;
    const frame = replay.frames[idx];
    if (!frame) return;

    for (const f of features) {
      f.properties.color = 'transparent';
      f.properties.intensityCode = -1;
    }
    const codeIndex = codeIndexRef.current;
    for (const [code, jindo] of Object.entries(frame.i)) {
      // 관측소 목록이 갱신되어 리플레이 데이터에 없는 코드일 수 있으므로 무시
      const feature = codeIndex?.get(code);
      if (!feature) continue;
      feature.properties.color = getExactJindoColor(jindo);
      feature.properties.intensityCode = Math.round((jindo + 3.0) * 2 + 100);
    }

    // 지도 소스에 직접 반영 (리플레이 모드라 실시간 업데이트는 차단된 상태)
    if (map) {
      const pts = map.getSource('intensity-points');
      if (pts) pts.setData({ type: 'FeatureCollection', features: features.slice() });
      const grid = map.getSource('detected-grids');
      if (grid) grid.setData(frame.g ?? { type: 'FeatureCollection', features: [] });
    }
  }, [map]);

  // 초기화: 리플레이 모드 켜기 + 데이터 로드
  useEffect(() => {
    mapController?.setReplayMode(true);
    let cancelled = false;
    (async () => {
      try {
        if (!stationCache) {
          const metaResp = await fetch('/intensity-points-v1.json');
          if (!metaResp.ok) throw new Error('station list load failed');
          const json = await metaResp.json();
          stationCache = Array.isArray(json) ? json : json.items;
        }
        const resp = await fetch(`/api/history/${entry.id}/replay`, { cache: 'no-store' });
        if (!resp.ok) throw new Error('replay load failed');
        const replay: ReplayData = await resp.json();
        if (cancelled) return;

        const features = (stationCache ?? [])
          .filter((s) => s.Location)
          .map((s) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [s.Location!.longitude, s.Location!.latitude] },
            properties: { code: s.Code, color: 'transparent', intensityCode: -1 },
          }));
        featuresRef.current = features;
        codeIndexRef.current = new Map(features.map((f) => [f.properties.code, f]));
        setData(replay);
        applyFrame(0, replay, features);
        setPlaying(true);
        onReady?.(true);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          onReady?.(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      mapController?.setReplayMode(false);
    };
  }, [entry.id, mapController, applyFrame, onReady]);

  // 재생 타이머
  useEffect(() => {
    if (!playing || !data) return;
    const timer = setInterval(() => {
      setFrameIdx((prev) => {
        const next = prev + 1;
        if (next >= data.frames.length) {
          setPlaying(false);
          return data.frames.length - 1;
        }
        applyFrame(next, data, featuresRef.current);
        return next;
      });
    }, (data.intervalSec || 1) * 1000);
    return () => clearInterval(timer);
  }, [playing, data, applyFrame]);

  const handleScrub = (idx: number) => {
    setPlaying(false);
    setFrameIdx(idx);
    applyFrame(idx, data, featuresRef.current);
  };

  return (
    <div className={styles.replayBar}>
      <button
        type="button"
        className={styles.replayCloseBtn}
        onClick={onClose}
        aria-label="Close replay"
      >
        <X size={16} />
      </button>
      {loadFailed ? (
        <span className={styles.replayTime}>{t('history.replayUnavailable')}</span>
      ) : !data ? (
        <span className={styles.replayTime}>{t('dashboard.loading')}</span>
      ) : (
        <>
          <span className={styles.replayTitle}>{t('history.replay')}</span>
          <button
            type="button"
            className={styles.replayPlayBtn}
            onClick={() => {
              // 마지막 프레임에서 누르면 처음부터
              if (!playing && frameIdx >= data.frames.length - 1) {
                setFrameIdx(0);
                applyFrame(0, data, featuresRef.current);
              }
              setPlaying(!playing);
            }}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <input
            type="range"
            className={styles.replaySlider}
            min={0}
            max={data.frames.length - 1}
            value={frameIdx}
            onChange={(e) => handleScrub(Number(e.target.value))}
          />
          <span className={styles.replayTime}>
            {formatFrameTime(data.times[frameIdx] ?? '')} ({frameIdx + 1}/{data.frames.length})
          </span>
        </>
      )}
    </div>
  );
};
