import { useEffect, useState, MutableRefObject } from 'react';
import { WolfxEEWService, EEWContext, EEWState } from '../WolfxEEWService';
import { getWaveSurfaceRadius, getMaxWaveDistanceKm } from '../travelTime';
import { buildWaveGeoJSON, buildEpicenterGeoJSON } from '../geoUtils';
import { WaveStats } from '../types';

interface UseEEWWavesProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapRef: MutableRefObject<any>;
  mapLoaded: boolean;
  eewContext: EEWContext;
  eewServiceRef: MutableRefObject<WolfxEEWService | null>;
}

export function useEEWWaves({ mapRef, mapLoaded, eewContext, eewServiceRef }: UseEEWWavesProps) {
  const [waveStats, setWaveStats] = useState<WaveStats>({
    elapsedSec: 0,
    pRadius: 0,
    sRadius: 0
  });

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    let animFrameId: number;

    const clearWaves = () => {
      const waveSource = map.getSource('eew-waves');
      if (waveSource) {
        waveSource.setData({ type: 'FeatureCollection', features: [] });
      }
      const epiSource = map.getSource('eew-epicenter');
      if (epiSource) {
        epiSource.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    const updateWaves = () => {
      const { state, data: activeEEW } = eewContext;

      if (state === EEWState.IDLE || state === EEWState.CANCELLED || !activeEEW || activeEEW.Latitude === undefined || activeEEW.Longitude === undefined) {
        clearWaves();
        return;
      }

      // 최종보일 때는 더 이상 파동을 갱신하지 않고 정지된 상태를 유지
      if (state === EEWState.FINAL) {
        // 이미 렌더링된 파동은 그대로 유지하되, 애니메이션 루프는 돌지 않음
        return;
      }

      const now = Date.now();
      const originTs = activeEEW.originTimestamp || now;
      const elapsedSec = Math.max(0, (now - originTs) / 1000);
      const depthKm = Math.max(0, activeEEW.Depth || 10);
      const magnitude = activeEEW.Magunitude || 3.5;

      // 규모 및 깊이에 따른 최대 도달 거리 (km)
      const maxDistanceKm = getMaxWaveDistanceKm(magnitude, depthKm);

      let pRadius = getWaveSurfaceRadius(elapsedSec, depthKm, 'P');
      let sRadius = getWaveSurfaceRadius(elapsedSec, depthKm, 'S');

      // P파가 최대 감쇠 거리를 넘어서면 P파 링 제거 (반경 0 처리)
      if (pRadius > maxDistanceKm * 1.15) {
        pRadius = 0;
      }
      // S파가 최대 감쇠 거리를 넘어서면 S파 링 제거
      if (sRadius > maxDistanceKm) {
        sRadius = 0;
      }

      const center: [number, number] = [activeEEW.Longitude, activeEEW.Latitude];
      const waveGeoJSON = buildWaveGeoJSON(center, pRadius, sRadius);
      const epiGeoJSON = buildEpicenterGeoJSON(center, {
        hypocenter: activeEEW.Hypocenter,
        magnitude: activeEEW.Magunitude
      });

      const waveSource = map.getSource('eew-waves');
      if (waveSource) {
        waveSource.setData(waveGeoJSON);
      }

      const epiSource = map.getSource('eew-epicenter');
      if (epiSource) {
        epiSource.setData(epiGeoJSON);
      }

      setWaveStats({
        elapsedSec: Math.floor(elapsedSec),
        pRadius: Math.round(pRadius),
        sRadius: Math.round(sRadius)
      });

      // P파와 S파 모두 최대 도달 거리에 도달해 소멸되었거나, 절대 안전 제한 시간(300초) 도달 시 종료
      const rawSRadius = getWaveSurfaceRadius(elapsedSec, depthKm, 'S');
      const isWavesFinished = rawSRadius >= maxDistanceKm;

      if (isWavesFinished || elapsedSec > 300) {
        if (eewServiceRef.current) {
          eewServiceRef.current.clearEEW();
        }
        return;
      }

      animFrameId = requestAnimationFrame(updateWaves);
    };

    updateWaves();

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [eewContext, mapLoaded, eewServiceRef, mapRef]);

  return { waveStats };
}
