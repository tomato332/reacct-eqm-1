import { haversineDistance, getJindoString, NoiseFilterService } from './utils';
import { getExactJindoColor } from './colorMap';
import { StationPointMeta } from './KmoniService';

export interface StationData {
  id: number;
  code: string;
  name: string;
  region: string;
  lonlat: [number, number];
  jindo: number | null;
  near: StationData[];
  delta: number[];
  deltaSum: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any | null;
  expireTime: number | null;
  color: string;
  intensityCode: number;
  rawJindoHistory?: number[];
}

export interface TopStationItem {
  rank: number;
  id: number;
  code: string;
  name: string;
  region: string;
  fullName: string;
  jindo: number | null;
  jindoStr: string;
  jindoFormatted: string;
  color: string;
  intensityCode: number;
  lonlat: [number, number];
}

export class QuakeDetectService {
  private noiseFilter = new NoiseFilterService();
  private hadActiveEvents = false;

  stationsState = new Map<string, StationData>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geojson: any = null;
  detectEnabled = true; // 강제 활성화

  estEpi: [number, number] | null = null;
  estOrigin: number | null = null;

  /**
   * intensity-points-v1.json 메타데이터 기반 관측소 초기화
   */
  initKmoniStations(stationMetas: StationPointMeta[]): any {
    const stnArray: StationData[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any[] = [];

    stationMetas.forEach((meta, idx) => {
      const isMapped = !meta.IsSuspended && meta.Point !== null && meta.Point !== undefined;
      const lon = meta.Location.longitude;
      const lat = meta.Location.latitude;
      const code = meta.Code || idx.toString();
      const name = meta.Name || `관측소 ${idx}`;
      const region = meta.Region || '';
      const fullName = region ? `${region} ${name}` : name;

      const initialColor = isMapped ? getExactJindoColor(-3.0) : 'transparent';
      const initialIntensityCode = isMapped ? 100 : -1;

      const stn: StationData = {
        id: idx,
        code,
        name,
        region,
        lonlat: [lon, lat],
        jindo: null,
        near: [],
        delta: [],
        deltaSum: 0,
        event: null,
        expireTime: null,
        color: initialColor,
        intensityCode: initialIntensityCode
      };

      this.stationsState.set(code, stn);
      stnArray.push(stn);

      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          name: fullName,
          code,
          color: initialColor,
          intensityCode: initialIntensityCode
        }
      });
    });

    // Calculate neighbors (adaptive 20km~30km for rural & island stations)
    for (let i = 0; i < stnArray.length; i++) {
      const nearDists: { stn: StationData; dist: number }[] = [];
      for (let j = 0; j < stnArray.length; j++) {
        if (i === j) continue;
        const lon1 = stnArray[i].lonlat[0];
        const lat1 = stnArray[i].lonlat[1];
        const lon2 = stnArray[j].lonlat[0];
        const lat2 = stnArray[j].lonlat[1];

        const dist = haversineDistance(lon1, lat1, lon2, lat2);

        if (dist <= 30) {
          nearDists.push({ stn: stnArray[j], dist });
        }
      }
      nearDists.sort((a, b) => a.dist - b.dist);
      stnArray[i].near = nearDists.filter((item, idx) => item.dist <= 20 || idx < 3).map((item) => item.stn);
    }

    this.geojson = { type: 'FeatureCollection', features };
    return this.geojson;
  }

  initStations(sitelist: number[][], metaMap?: Record<number, { name: string; region: string }>): any {
    const stnArray: StationData[] = [];
    const features = sitelist.map((p, i) => {
      const lat = p[0];
      const lon = p[1];
      const code = i.toString();
      const meta = metaMap?.[i];
      const name = meta?.name || `관측소 ${i}`;
      const region = meta?.region || '';
      const fullName = region ? `${region} ${name}` : name;

      const stn: StationData = {
        id: i,
        code,
        name,
        region,
        lonlat: [lon, lat],
        jindo: null,
        near: [],
        delta: [],
        deltaSum: 0,
        event: null,
        expireTime: null,
        color: getExactJindoColor(-3.0),
        intensityCode: 100
      };
      this.stationsState.set(code, stn);
      stnArray.push(stn);

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { name: fullName, code, color: getExactJindoColor(-3.0), intensityCode: 100 }
      };
    });

    // Calculate neighbors (adaptive 20km~30km for rural & island stations)
    for (let i = 0; i < stnArray.length; i++) {
      const nearDists: { stn: StationData; dist: number }[] = [];
      for (let j = 0; j < stnArray.length; j++) {
        if (i === j) continue;
        const lon1 = stnArray[i].lonlat[0];
        const lat1 = stnArray[i].lonlat[1];
        const lon2 = stnArray[j].lonlat[0];
        const lat2 = stnArray[j].lonlat[1];

        const dist = haversineDistance(lon1, lat1, lon2, lat2);

        if (dist <= 30) {
          nearDists.push({ stn: stnArray[j], dist });
        }
      }
      nearDists.sort((a, b) => a.dist - b.dist);
      stnArray[i].near = nearDists.filter((item, idx) => item.dist <= 20 || idx < 3).map((item) => item.stn);
    }

    this.geojson = { type: 'FeatureCollection', features };
    return this.geojson;
  }

  // 야후의 intensityStr ('e', 'f' 등)를 Jindo 값으로 변환
  private charCodeToJindo(code: number): number | null {
    if (isNaN(code) || code === 0) return null;
    // 'd'(100)를 대략 진도 -3.0으로 맵핑하여 선형 변환
    return (code - 100) * 0.5 - 3.0; 
  }

  /**
   * Kyoshin Monitor GIF 픽셀 파싱 또는 서버 집계 데이터 (Station Code -> 계측진도) 처리
   */
  processKmoniParsedData(
    intensityMap: Map<string, number | null> | Record<string, number | null>,
    callbacks?: {
      onPointsUpdated?: (geojson: any) => void;
      onDetectedUpdated?: (detectedGeojson: any) => void;
      onNewEventDetected?: (center: [number, number]) => void;
      onEventsFinished?: () => void;
      onSoundTriggered?: (jindo: number, jindoStr: string) => void;
      onTopStationsUpdated?: (topStations: TopStationItem[]) => void;
    }
  ) {
    if (!this.geojson) return;

    let updated = false;
    const isMap = intensityMap instanceof Map;

    for (const feature of this.geojson.features) {
      const codeStr = feature.properties.code;
      const jindo = isMap ? (intensityMap.has(codeStr) ? intensityMap.get(codeStr)! : null) : (intensityMap[codeStr] ?? null);
      const newColor = jindo !== null ? getExactJindoColor(jindo) : 'transparent';
      const intensityCode = jindo !== null ? Math.round((jindo + 3.0) * 2 + 100) : -1;

      if (feature.properties.color !== newColor || feature.properties.intensityCode !== intensityCode) {
        feature.properties.color = newColor;
        feature.properties.intensityCode = intensityCode;
        updated = true;
      }

      if (this.detectEnabled) {
        const stn = this.stationsState.get(codeStr);
        if (stn) {
          stn.color = newColor;
          stn.intensityCode = intensityCode;
          if (jindo !== null) {
            const filteredJindo = this.noiseFilter.applyMedianFilter(stn, jindo);

            let delta = 0;
            if (stn.jindo !== null) {
              delta = filteredJindo - stn.jindo;
            }
            stn.jindo = filteredJindo;
            stn.delta.unshift(delta);
            if (stn.delta.length > 10) stn.delta.pop();
            
            stn.deltaSum = stn.delta.reduce((acc, val) => acc + val, 0);
          } else {
            stn.jindo = null;
            stn.delta = [];
            stn.deltaSum = 0;
          }
        }
      }
    }

    this.runDetectionPipeline(updated, callbacks);
  }

  processRealtimeData(
    intensityStr: string,
    callbacks?: {
      onPointsUpdated?: (geojson: any) => void;
      onDetectedUpdated?: (detectedGeojson: any) => void;
      onNewEventDetected?: (center: [number, number]) => void;
      onEventsFinished?: () => void;
      onSoundTriggered?: (jindo: number, jindoStr: string) => void;
      onTopStationsUpdated?: (topStations: TopStationItem[]) => void;
    }
  ) {
    if (!this.geojson) return;

    let updated = false;

    // 1. 데이터 업데이트 및 노이즈 필터링 적용
    for (const feature of this.geojson.features) {
      const codeStr = feature.properties.code;
      const id = parseInt(codeStr, 10);
      const charCode = intensityStr.charCodeAt(id);
      
      const jindo = this.charCodeToJindo(charCode);
      const newColor = jindo !== null ? getExactJindoColor(jindo) : 'transparent';
      const intensityCode = jindo !== null ? charCode : -1;

      if (feature.properties.color !== newColor || feature.properties.intensityCode !== intensityCode) {
        feature.properties.color = newColor;
        feature.properties.intensityCode = intensityCode;
        updated = true;
      }

      if (this.detectEnabled) {
        const stn = this.stationsState.get(codeStr);
        if (stn) {
          stn.color = newColor;
          if (jindo !== null) {
            // 노이즈 필터 적용 (SRP 분리: 3프레임 미디언 필터로 글리치 완전 제거)
            const filteredJindo = this.noiseFilter.applyMedianFilter(stn, jindo);

            let delta = 0;
            if (stn.jindo !== null) {
              delta = filteredJindo - stn.jindo;
            }
            stn.jindo = filteredJindo;
            stn.delta.unshift(delta);
            if (stn.delta.length > 10) stn.delta.pop();
            
            stn.deltaSum = stn.delta.reduce((acc, val) => acc + val, 0);
          } else {
            stn.jindo = null;
            stn.delta = [];
            stn.deltaSum = 0;
          }
        }
      }
    }

    this.runDetectionPipeline(updated, callbacks);
  }

  private runDetectionPipeline(
    updated: boolean,
    callbacks?: {
      onPointsUpdated?: (geojson: any) => void;
      onDetectedUpdated?: (detectedGeojson: any) => void;
      onNewEventDetected?: (center: [number, number]) => void;
      onEventsFinished?: () => void;
      onSoundTriggered?: (jindo: number, jindoStr: string) => void;
      onTopStationsUpdated?: (topStations: TopStationItem[]) => void;
    }
  ) {
    let detectedUpdated = false;
    let newEventDetected = false;
    let detectedCenter: [number, number] | null = null;

    // 2. 핵심 지진 감지 알고리즘
    if (this.detectEnabled) {
      const stations = Array.from(this.stationsState.values());
      
      const getLevel = (jVal: number | null) => {
        if (jVal === null) return 0;
        if (jVal < -1.0) return 1;
        if (jVal < 1.0) return 2;
        if (jVal < 3.0) return 3;
        if (jVal < 4.5) return 4;
        return 5;
      };

      const nowTick = Date.now();
      let soundJindoToPlay = -3;

      for (const stn of stations) {
        const isIsland = stn.near.length === 0;
        const isAnomaly = !stn.event && stn.deltaSum < 0.8 && stn.jindo !== null && stn.jindo >= (isIsland ? 4.5 : 3.0);
        
        if (isAnomaly) continue;

        if (stn.deltaSum > 1.2) {
          const u = stn.near;
          let targetEvent = stn.event;

          if (!targetEvent) {
            const neighborWithEvent = u.find((r: any) => r.event);
            if (neighborWithEvent) {
              targetEvent = neighborWithEvent.event;
            } else {
              let rCount = 0;
              for (const neighbor of u) {
                if (neighbor.deltaSum > 0.8) rCount++;
              }
              
              const isIslandAndStrong = isIsland && stn.jindo !== null && stn.jindo >= 4.2;
              const neighborRatio = u.length > 0 ? (rCount / u.length) : 0;
              const hasEnoughNeighbors = u.length > 0 && (rCount >= 2 || rCount === u.length) && neighborRatio >= 0.6;
              const isFelt = stn.jindo !== null && stn.jindo >= -0.5;

              if (isFelt && (isIslandAndStrong || hasEnoughNeighbors)) {
                targetEvent = {
                  id: Math.random(),
                  startTime: nowTick,
                  maxLevel: 0
                };
                newEventDetected = true;
                detectedCenter = stn.lonlat;
              }
            }
          } else {
            const otherEventStn = u.find((r: any) => r.event && r.event.id !== targetEvent.id);
            if (otherEventStn && otherEventStn.event.startTime < targetEvent.startTime) {
              targetEvent = otherEventStn.event;
            }
          }

          if (targetEvent) {
            stn.event = targetEvent;
            
            const currentLevel = getLevel(stn.jindo);
            if (currentLevel > targetEvent.maxLevel) {
              targetEvent.maxLevel = currentLevel;
              if (stn.jindo !== null && stn.jindo > soundJindoToPlay) {
                soundJindoToPlay = stn.jindo;
              }
            }
            
            stn.expireTime = Date.now() + 10000;
            detectedUpdated = true;
          }
        } else if (stn.event && stn.jindo !== null && stn.jindo >= -0.5) {
          const currentLevel = getLevel(stn.jindo);
          if (currentLevel > stn.event.maxLevel) {
            stn.event.maxLevel = currentLevel;
            if (stn.jindo !== null && stn.jindo > soundJindoToPlay) {
              soundJindoToPlay = stn.jindo;
            }
          }

          stn.expireTime = Date.now() + 10000;
          detectedUpdated = true;
        }
      }
      
      if (soundJindoToPlay > -3 && callbacks?.onSoundTriggered) {
        callbacks.onSoundTriggered(soundJindoToPlay, getJindoString(soundJindoToPlay));
      }
    }

    if (newEventDetected && callbacks?.onNewEventDetected) {
      const newlyTriggered = Array.from(this.stationsState.values()).filter(s => s.event !== null);
      if (newlyTriggered.length > 0) {
        const sumLon = newlyTriggered.reduce((acc, s) => acc + s.lonlat[0], 0);
        const sumLat = newlyTriggered.reduce((acc, s) => acc + s.lonlat[1], 0);
        detectedCenter = [sumLon / newlyTriggered.length, sumLat / newlyTriggered.length];
      }
      if (detectedCenter) {
        callbacks.onNewEventDetected(detectedCenter);
      }
    }

    if (callbacks?.onTopStationsUpdated) {
      callbacks.onTopStationsUpdated(this.getTopStations(5));
    }

    if (updated && callbacks?.onPointsUpdated) {
      callbacks.onPointsUpdated(this.geojson);
    }
    
    if (detectedUpdated) {
      this.updateDetectedEvents(callbacks?.onDetectedUpdated, callbacks?.onEventsFinished);
    }
    
    this.checkExpirationTick(Date.now(), callbacks?.onDetectedUpdated, callbacks?.onEventsFinished);
  }

  getTopStations(limit = 5): TopStationItem[] {
    const stations = Array.from(this.stationsState.values()).filter(s => s.jindo !== null);
    stations.sort((a, b) => {
      const valA = a.jindo !== null ? a.jindo : -999;
      const valB = b.jindo !== null ? b.jindo : -999;
      return valB - valA;
    });

    return stations.slice(0, limit).map((stn, index) => {
      const jindo = stn.jindo;
      const jindoStr = jindo !== null ? getJindoString(jindo) : '-';
      const jindoFormatted = jindo !== null ? (jindo >= 0 ? `+${jindo.toFixed(1)}` : jindo.toFixed(1)) : '-';
      const fullName = stn.region ? `${stn.region} ${stn.name}` : stn.name;

      return {
        rank: index + 1,
        id: stn.id,
        code: stn.code,
        name: stn.name,
        region: stn.region,
        fullName,
        jindo,
        jindoStr,
        jindoFormatted,
        color: stn.color,
        intensityCode: stn.intensityCode,
        lonlat: stn.lonlat
      };
    });
  }

  updateDetectedEvents(
    onGeoJSONUpdated?: (geojson: any) => void,
    onEventsFinished?: () => void
  ): any {
    const originLon = 120;
    const originLat = 20;
    const latStep = 0.8; // 균일 위도 간격 (~89km) - 겹침 방지
    const lonStep = 1.0; // 균일 경도 간격 (~90km in Japan) - 겹침 방지

    const activeGrids = new Map<string, { color: string; maxJindo: number; gridX: number; gridY: number }>();

    for (const stn of this.stationsState.values()) {
      if (stn.event) {
        const lat = stn.lonlat[1];
        const lon = stn.lonlat[0];
        const gridY = Math.floor((lat - originLat) / latStep);
        const gridX = Math.floor((lon - originLon) / lonStep);
        const cellId = `${gridX}_${gridY}`;

        const current = activeGrids.get(cellId);
        const stnJindo = stn.jindo !== null ? stn.jindo : -3;

        if (!current || stnJindo > current.maxJindo) {
          activeGrids.set(cellId, { color: stn.color, maxJindo: stnJindo, gridX, gridY });
        }
      }
    }

    const detectedFeatures: any[] = [];
    for (const [, data] of activeGrids.entries()) {
      const { gridX, gridY } = data;
      const minLat = Number((originLat + gridY * latStep).toFixed(6));
      const maxLat = Number((originLat + (gridY + 1) * latStep).toFixed(6));
      const minLon = Number((originLon + gridX * lonStep).toFixed(6));
      const maxLon = Number((originLon + (gridX + 1) * lonStep).toFixed(6));

      detectedFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLon, minLat],
              [maxLon, minLat],
              [maxLon, maxLat],
              [minLon, maxLat],
              [minLon, minLat]
            ]
          ]
        },
        properties: {
          color: data.color
        }
      });
    }

    const detectedGeojson = {
      type: 'FeatureCollection',
      features: detectedFeatures
    };

    const hasGrids = detectedFeatures.length > 0;
    if (hasGrids) {
      this.hadActiveEvents = true;
    } else if (this.hadActiveEvents && !hasGrids) {
      this.hadActiveEvents = false;
      if (onEventsFinished) {
        onEventsFinished();
      }
    }

    if (onGeoJSONUpdated) {
      onGeoJSONUpdated(detectedGeojson);
    }
    return detectedGeojson;
  }

  checkExpirationTick(
    now: number,
    onGeoJSONUpdated?: (geojson: any) => void,
    onEventsFinished?: () => void
  ) {
    let expired = false;
    for (const stn of this.stationsState.values()) {
      if (stn.event && stn.expireTime && now >= stn.expireTime) {
        stn.event = null;
        stn.expireTime = null;
        expired = true;
      }
    }

    if (expired) {
      this.updateDetectedEvents(onGeoJSONUpdated, onEventsFinished);
    }
  }
}
