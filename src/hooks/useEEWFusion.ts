import { useState, useEffect } from 'react';
import { EEWContext, EEWState, WolfxEEWData } from '../WolfxEEWService';
import { TopStationItem } from '../QuakeDetectService';

export interface FusionEEWData extends WolfxEEWData {
  isCorrected?: boolean;
  OriginalMagunitude?: number;
  OriginalMaxIntensity?: string;
  OriginalLatitude?: number;
  OriginalLongitude?: number;
}

export interface FusionContext {
  state: EEWState;
  data: FusionEEWData | null;
}

export function useEEWFusion(eewContext: EEWContext, topStations: TopStationItem[], kmoniDetectedCenter: [number, number] | null): FusionContext {
  const [fusionContext, setFusionContext] = useState<FusionContext>({ state: EEWState.IDLE, data: null });

  useEffect(() => {
    if (eewContext.state === EEWState.IDLE || !eewContext.data) {
      setFusionContext({ state: EEWState.IDLE, data: null });
      return;
    }

    const fusedData: FusionEEWData = { ...eewContext.data };
    let isCorrected = false;

    // 1~2초 뒤 K-moni 실시간 진도 데이터 도달 시 보정 (Correction) 로직
    if (topStations.length > 0) {
      const maxStn = topStations[0];
      const maxJindo = maxStn.jindo;
      
      // K-moni 실측 최대 진도 보정
      if (maxJindo !== null && maxJindo >= -1.0) {
        let estimatedJindoScale = maxStn.jindoStr;
        // K-moni 진도가 기존 EEW 예상 진도보다 현저히 높다면 보정 적용
        if (estimatedJindoScale !== fusedData.MaxIntensity && maxJindo > 1.0) {
           fusedData.OriginalMaxIntensity = fusedData.MaxIntensity;
           fusedData.MaxIntensity = `${estimatedJindoScale} (K-moni 보정)`;
           isCorrected = true;
        }
      }
    }

    // 진앙지 위치 퓨전 (K-moni에서 감지된 초기 트리거 포인트)
    if (kmoniDetectedCenter && kmoniDetectedCenter[0] !== 0 && fusedData.Longitude && fusedData.Latitude) {
       // 거리가 약 30km 이상 차이나면 보정 
       const dist = Math.hypot(fusedData.Longitude - kmoniDetectedCenter[0], fusedData.Latitude - kmoniDetectedCenter[1]);
       if (dist > 0.3) { 
         fusedData.OriginalLatitude = fusedData.Latitude;
         fusedData.OriginalLongitude = fusedData.Longitude;
         // 가중치 기반 블렌딩 (Wolfx 70%, Kmoni 30%)
         fusedData.Longitude = fusedData.Longitude * 0.7 + kmoniDetectedCenter[0] * 0.3;
         fusedData.Latitude = fusedData.Latitude * 0.7 + kmoniDetectedCenter[1] * 0.3;
         fusedData.Hypocenter = fusedData.Hypocenter + ' (센서 퓨전 보정됨)';
         isCorrected = true;
       }
    }

    fusedData.isCorrected = isCorrected;

    setFusionContext({
      state: eewContext.state,
      data: fusedData
    });
  }, [eewContext, topStations, kmoniDetectedCenter]);

  return fusionContext;
}
