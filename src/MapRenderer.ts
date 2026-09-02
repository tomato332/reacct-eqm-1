import * as topojson from 'topojson-client';
import i18n from './i18n';
import { QuakeDetectService, TopStationItem } from './QuakeDetectService';
import { StationPointMeta } from './KmoniService';
import { BackgroundSyncService } from './backgroundSyncService';
import { DataSourceType, HoverInfo, IGeoProvider, MapRendererController, DetectionAlertInfo } from './types';
import { getExactJindoColor } from './colorMap';
import { fitJapanBounds } from './zoomUtils';
import { P2PEarthquakeEvent, formatScaleJMA } from './P2PQuakeService';
import { translatePrefecture, translateRegionName, formatObservationPointName } from './translateUtils';

function isPointInRing(pt: [number, number], ring: [number, number][]): boolean {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findAreaFeature(lon: number, lat: number, pref: string, name: string, features: any[]): any | null {
  // 1. 점(Point) 좌표 기반 폴리곤 공간 매칭 (Point-In-Polygon)
  if (lon !== 0 && lat !== 0 && !isNaN(lon) && !isNaN(lat) && Array.isArray(features)) {
    for (const f of features) {
      const geom = f?.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
        if (isPointInRing([lon, lat], geom.coordinates[0])) return f;
      } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
        for (const poly of geom.coordinates) {
          if (Array.isArray(poly?.[0]) && isPointInRing([lon, lat], poly[0])) return f;
        }
      }
    }
  }

  // 2. 지역명 / 도도부현명 텍스트 매칭
  const safePref = (pref || '').trim();
  const safeName = (name || '').trim();
  const full = safePref + safeName;

  if (Array.isArray(features)) {
    for (const f of features) {
      const fName = f.properties?.name || '';
      if (fName === full || fName === safeName) return f;
    }
    for (const f of features) {
      const fName = f.properties?.name || '';
      if (safeName && (fName.includes(safeName) || safeName.includes(fName))) return f;
      if (full && (fName.includes(full) || full.includes(fName))) return f;
    }
  }
  return null;
}

export class StaticGeoProvider implements IGeoProvider {
  getWorldGeoUrl(): string {
    return '/world.json';
  }
  getJapanTopoUrl(): string {
    return '/AreaForecastLocalE_GIS_20240520_1.json';
  }
  getIntensityPointsUrl(): string {
    return '/proxy?url=https://weather-kyoshin.west.edge.storage-yahoo.jp/SiteList/sitelist.json';
  }
}

export class CleanVectorMapRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async render(
    map: any,
    worldUrl: string,
    japanTopoUrl: string,
    intensityPointsUrl: string,
    onHover: (info: HoverInfo | null) => void,
    onTopStationsUpdated?: (topStations: TopStationItem[]) => void,
    onKmoniEventDetected?: (center: [number, number]) => void,
    onDetectionAlert?: (alert: DetectionAlertInfo) => void,
    onDetectionFinished?: () => void
  ): Promise<MapRendererController> {
    // 1. world.json (세계 지도 레이어)에서 일본(Japan) 피처 제외
    try {
      const worldResp = await fetch(worldUrl);
      const worldData = await worldResp.json();
      if (worldData && Array.isArray(worldData.features)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worldData.features = worldData.features.filter((f: any) => {
          const name = f.properties?.name || f.properties?.name_long;
          const iso = f.properties?.iso_a3 || f.properties?.adm0_a3;
          return name !== 'Japan' && iso !== 'JPN';
        });
      }
      map.addSource('world-geo', { type: 'geojson', data: worldData });
    } catch (err) {
      console.error('Failed to load world.json:', err);
      map.addSource('world-geo', { type: 'geojson', data: worldUrl });
    }

    map.addLayer({
      id: 'world-fill',
      type: 'fill',
      source: 'world-geo',
      paint: {
        'fill-color': '#1e293b',
        'fill-opacity': 0.7
      }
    });

    map.addLayer({
      id: 'world-line',
      type: 'line',
      source: 'world-geo',
      paint: {
        'line-color': '#334155',
        'line-width': 0.8
      }
    });

    // 2. 일본 기상청 세분구역 TopoJSON 데이터 가져오기 및 GeoJSON 변환
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let japanGeojson: any = null;
    try {
      const resp = await fetch(japanTopoUrl);
      const topoData = await resp.json();

      const objectKey = Object.keys(topoData.objects)[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geojson: any = topojson.feature(topoData, topoData.objects[objectKey]);
      japanGeojson = geojson;

      map.addSource('japan-geo', { type: 'geojson', data: geojson });

      // 일본 세분 구역 채우기 (다크 기본)
      map.addLayer({
        id: 'japan-fill',
        type: 'fill',
        source: 'japan-geo',
        paint: {
          'fill-color': '#334155',
          'fill-opacity': 1.0
        }
      });

      // 일본 세분 구역 외곽선
      map.addLayer({
        id: 'japan-line',
        type: 'line',
        source: 'japan-geo',
        paint: {
          'line-color': '#0f172a',
          'line-width': 0.8
        }
      });

      // 지역 호버 이벤트 (구역명 및 코드 표시)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('mousemove', 'japan-fill', (e: any) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          if (props && props.name) {
            const currentLng = i18n.language;
            const transName = translateRegionName(props.name, currentLng);
            const codeLabel = currentLng.startsWith('en') ? 'Area Code' : currentLng.startsWith('ja') ? '区域コード' : '구역 코드';
            onHover({
              type: 'prefecture',
              title: transName !== props.name ? `${transName}` : props.name,
              subtitle: props.name !== transName ? `${props.name} | ${codeLabel}: ${props.code}` : `${codeLabel}: ${props.code}`,
              x: e.point?.x,
              y: e.point?.y
            });
          }
        }
      });

      map.on('mouseleave', 'japan-fill', () => {
        onHover(null);
      });
    } catch (err) {
      console.error('Failed to load japan topo data:', err);
    }

    // 3. P파 / S파 전파 원 및 진앙지 마커 레이어 추가
    map.addSource('eew-waves', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // P파 내부 채우기 (Cyan)
    map.addLayer({
      id: 'eew-waves-p-fill',
      type: 'fill',
      source: 'eew-waves',
      filter: ['==', ['get', 'waveType'], 'P'],
      paint: {
        'fill-color': '#06b6d4',
        'fill-opacity': 0.12
      }
    });

    // P파 경계선 (Cyan)
    map.addLayer({
      id: 'eew-waves-p-line',
      type: 'line',
      source: 'eew-waves',
      filter: ['==', ['get', 'waveType'], 'P'],
      paint: {
        'line-color': '#06b6d4',
        'line-width': 2.5,
        'line-opacity': 0.85
      }
    });

    // S파 내부 채우기 (Orange / Red)
    map.addLayer({
      id: 'eew-waves-s-fill',
      type: 'fill',
      source: 'eew-waves',
      filter: ['==', ['get', 'waveType'], 'S'],
      paint: {
        'fill-color': '#ef4444',
        'fill-opacity': 0.22
      }
    });

    // S파 경계선 (Red)
    map.addLayer({
      id: 'eew-waves-s-line',
      type: 'line',
      source: 'eew-waves',
      filter: ['==', ['get', 'waveType'], 'S'],
      paint: {
        'line-color': '#ef4444',
        'line-width': 3.0,
        'line-opacity': 0.95
      }
    });

    // 진앙지 마커 소스 및 레이어
    map.addSource('eew-epicenter', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'eew-epicenter-glow',
      type: 'circle',
      source: 'eew-epicenter',
      paint: {
        'circle-radius': 14,
        'circle-color': '#ef4444',
        'circle-opacity': 0.35,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.addLayer({
      id: 'eew-epicenter-center',
      type: 'circle',
      source: 'eew-epicenter',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ef4444'
      }
    });

    // P2PQuake 진원지 소스 및 레이어
    map.addSource('p2p-hypocenter', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // KMA 지진 진원지 소스 및 레이어
    map.addSource('kma-hypocenter', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // P2PQuake 진도 관측 구역 채우기 레이어 (AreaForecastLocalE_GIS 기반 폴리곤 채색)
    map.addSource('p2p-areas', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'p2p-areas-fill',
      type: 'fill',
      source: 'p2p-areas',
      layout: {
        visibility: 'none'
      },
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['get', 'opacity']
      }
    });

    map.addLayer({
      id: 'p2p-areas-line',
      type: 'line',
      source: 'p2p-areas',
      layout: {
        visibility: 'none'
      },
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.2,
        'line-opacity': ['case', ['!=', ['get', 'color'], 'transparent'], 0.8, 0]
      }
    });

    // P2P 구역 마우스 호버 이벤트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('mousemove', 'p2p-areas-fill', (e: any) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        if (!props || !props.scale || Number(props.scale) < 10 || props.color === 'transparent') {
          map.getCanvas().style.cursor = '';
          onHover(null);
          return;
        }

        map.getCanvas().style.cursor = 'pointer';
        const currentLng = i18n.language;
        const transName = translateRegionName(props.name, currentLng);
        const maxScaleLabel = currentLng.startsWith('en') ? 'Max Intensity' : currentLng.startsWith('ja') ? '最大震度' : '최대 관측 진도';
        const codeLabel = currentLng.startsWith('en') ? 'Area Code' : currentLng.startsWith('ja') ? '区域コード' : '구역 코드';
        let scaleStr = props.scaleStr;
        if (currentLng.startsWith('en')) scaleStr = scaleStr.replace('강', '+').replace('약', '-');
        if (currentLng.startsWith('ja')) scaleStr = scaleStr.replace('강', '強').replace('약', '弱');

        onHover({
          type: 'prefecture',
          title: transName !== props.name ? `${transName}` : props.name,
          subtitle: `${maxScaleLabel}: ${scaleStr} | ${codeLabel}: ${props.code}${props.name !== transName ? ` (${props.name})` : ''}`,
          x: e.point?.x,
          y: e.point?.y,
          scaleColor: props.color
        });
      }
    });

    map.on('mouseleave', 'p2p-areas-fill', () => {
      map.getCanvas().style.cursor = '';
      onHover(null);
    });

    // P2PQuake 관측점 소스 및 레이어 (Code 551)
    map.addSource('p2p-points', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'p2p-points-layer',
      type: 'circle',
      source: 'p2p-points',
      layout: {
        visibility: 'none'
      },
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          4, ['interpolate', ['linear'], ['get', 'scale'], 10, 4, 30, 6, 50, 8, 70, 11],
          7, ['interpolate', ['linear'], ['get', 'scale'], 10, 6, 30, 8, 50, 11, 70, 15],
          10, ['interpolate', ['linear'], ['get', 'scale'], 10, 8, 30, 12, 50, 16, 70, 22]
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.9,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.addLayer({
      id: 'p2p-hypocenter-glow',
      type: 'circle',
      source: 'p2p-hypocenter',
      paint: {
        'circle-radius': 16,
        'circle-color': '#dc2626',
        'circle-opacity': 0.35,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.addLayer({
      id: 'p2p-hypocenter-center',
      type: 'circle',
      source: 'p2p-hypocenter',
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#dc2626'
      }
    });

    map.addLayer({
      id: 'kma-hypocenter-glow',
      type: 'circle',
      source: 'kma-hypocenter',
      paint: {
        'circle-radius': 24,
        'circle-color': '#2563eb', // Blue glow for KMA
        'circle-opacity': 0.35,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.addLayer({
      id: 'kma-hypocenter-center',
      type: 'circle',
      source: 'kma-hypocenter',
      paint: {
        'circle-radius': 8,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#2563eb'
      }
    });

    // P2P 관측점 마우스 이벤트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('mousemove', 'p2p-points-layer', (e: any) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        map.getCanvas().style.cursor = 'pointer';
        const currentLng = i18n.language;
        const { fullTranslated } = formatObservationPointName(props.pref, props.name, currentLng);
        const obsScaleLabel = currentLng.startsWith('en') ? 'Observed Intensity' : currentLng.startsWith('ja') ? '観測震度' : '관측 진도';
        let scaleStr = props.scaleStr;
        if (currentLng.startsWith('en')) scaleStr = scaleStr.replace('강', '+').replace('약', '-');
        if (currentLng.startsWith('ja')) scaleStr = scaleStr.replace('강', '強').replace('약', '弱');

        onHover({
          type: 'p2p_point',
          title: `${fullTranslated}`,
          subtitle: `${obsScaleLabel}: ${scaleStr}${props.name && currentLng !== 'ja' ? ` [${props.pref} ${props.name}]` : ''}`,
          x: e.point?.x,
          y: e.point?.y,
          scaleColor: props.color
        });
      }
    });

    map.on('mouseleave', 'p2p-points-layer', () => {
      map.getCanvas().style.cursor = '';
      onHover(null);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('mousemove', 'p2p-hypocenter-center', (e: any) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        map.getCanvas().style.cursor = 'pointer';
        const currentLng = i18n.language;
        const transHypo = translateRegionName(props.name, currentLng);
        const tag = currentLng.startsWith('en') ? '[Epicenter]' : currentLng.startsWith('ja') ? '【震源地】' : '[진원지]';
        const timeLabel = currentLng.startsWith('en') ? 'Time' : currentLng.startsWith('ja') ? '発生' : '발생';
        const depthLabel = currentLng.startsWith('en') ? 'Depth' : currentLng.startsWith('ja') ? '深さ' : '깊이';
        const maxLabel = currentLng.startsWith('en') ? 'Max' : currentLng.startsWith('ja') ? '最大' : '최대진도';
        let maxScaleStr = props.maxScaleStr;
        if (currentLng.startsWith('en')) maxScaleStr = maxScaleStr.replace('강', '+').replace('약', '-');
        if (currentLng.startsWith('ja')) maxScaleStr = maxScaleStr.replace('강', '強').replace('약', '弱');

        onHover({
          type: 'p2p_hypocenter',
          title: `${tag} ${transHypo}`,
          subtitle: `${timeLabel}: ${props.time} | M${props.magnitude} | ${depthLabel} ${props.depth}km | ${maxLabel}: ${maxScaleStr}${props.name !== transHypo ? ` (${props.name})` : ''}`,
          x: e.point?.x,
          y: e.point?.y
        });
      }
    });

    map.on('mouseleave', 'p2p-hypocenter-center', () => {
      map.getCanvas().style.cursor = '';
      onHover(null);
    });

    // KMA 관측점 마우스 이벤트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('mousemove', 'kma-hypocenter-center', (e: any) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        map.getCanvas().style.cursor = 'pointer';
        const currentLng = i18n.language;
        const tag = currentLng.startsWith('en') ? '[KMA Epicenter]' : currentLng.startsWith('ja') ? '【韓国気象庁 震源地】' : '[기상청 진원지]';
        const timeLabel = currentLng.startsWith('en') ? 'Time' : currentLng.startsWith('ja') ? '発生' : '발생';
        const depthLabel = currentLng.startsWith('en') ? 'Depth' : currentLng.startsWith('ja') ? '深さ' : '깊이';
        
        onHover({
          type: 'p2p_hypocenter', // Reusing the type to show general popup
          title: `${tag} ${props.name}`,
          subtitle: `${timeLabel}: ${props.time} | M${props.magnitude}${props.depth ? ` | ${depthLabel} ${props.depth}km` : ''}`,
          x: e.point?.x,
          y: e.point?.y
        });
      }
    });

    map.on('mouseleave', 'kma-hypocenter-center', () => {
      map.getCanvas().style.cursor = '';
      onHover(null);
    });

    let updateInterval: number | null = null;
    let currentDataSource: DataSourceType = 'kmoni';

    const kmoniQuakeService = new QuakeDetectService();
    const yahooQuakeService = new QuakeDetectService();

    let stationMetas: StationPointMeta[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let yahooPointsItems: any[] = [];

    // 4. 관측소 데이터 로드 및 초기화 (Kmoni 및 Yahoo)
    try {
      try {
        const metaResp = await fetch('/intensity-points-v1.json');
        if (metaResp.ok) {
          stationMetas = await metaResp.json();
        }
      } catch (e) {
        console.warn('Failed to load station metadata:', e);
      }

      // Yahoo SiteList 로드
      try {
        const yahooResp = await fetch(intensityPointsUrl);
        if (yahooResp.ok) {
          const yahooData = await yahooResp.json();
          if (yahooData && Array.isArray(yahooData.items)) {
            yahooPointsItems = yahooData.items;
          }
        }
      } catch (e) {
        console.warn('Failed to load Yahoo SiteList:', e);
      }

      // Yahoo 관측소 메타 매핑 생성
      const yahooMetaMap: Record<number, { name: string; region: string }> = {};
      if (yahooPointsItems.length > 0 && stationMetas.length > 0) {
        yahooPointsItems.forEach((item, i) => {
          const lat = item[0];
          const lon = item[1];
          let closest: StationPointMeta | null = null;
          let minDist = Infinity;
          for (const m of stationMetas) {
            const d = Math.hypot(m.Location.latitude - lat, m.Location.longitude - lon);
            if (d < minDist) {
              minDist = d;
              closest = m;
            }
          }
          yahooMetaMap[i] = {
            name: closest ? closest.Name : `관측소 ${i}`,
            region: closest ? closest.Region : ''
          };
        });
      }

      // 양쪽 서비스 관측소 초기화
      const kmoniInitialGeojson = stationMetas.length > 0 ? kmoniQuakeService.initKmoniStations(stationMetas) : null;
      if (yahooPointsItems.length > 0) {
        yahooQuakeService.initStations(yahooPointsItems, yahooMetaMap);
      }

      const initialGeojson = kmoniInitialGeojson || yahooQuakeService.geojson || { type: 'FeatureCollection', features: [] };

      map.addSource('intensity-points', {
        type: 'geojson',
        data: initialGeojson
      });

      map.addSource('detected-grids', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add Grid Layers for Detected Events
      map.addLayer({
        id: 'detected-grids-fill',
        type: 'fill',
        source: 'detected-grids',
        paint: {
          'fill-color': 'transparent',
          'fill-opacity': 0
        }
      });

      map.addLayer({
        id: 'detected-grids-line',
        type: 'line',
        source: 'detected-grids',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ef4444'],
          'line-width': 2.0,
          'line-opacity': 0.9
        }
      });

      map.addLayer({
        id: 'intensity-points-layer',
        type: 'circle',
        source: 'intensity-points',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, ['case', ['<', ['get', 'intensityCode'], 0], 0, ['==', ['get', 'color'], 'transparent'], 0, ['<', ['get', 'intensityCode'], 101], 2.5, ['<', ['get', 'intensityCode'], 104], 4.5, 7.0],
            8, ['case', ['<', ['get', 'intensityCode'], 0], 0, ['==', ['get', 'color'], 'transparent'], 0, ['<', ['get', 'intensityCode'], 101], 4.0, ['<', ['get', 'intensityCode'], 104], 6.5, 9.5]
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': [
            'case',
            ['<', ['get', 'intensityCode'], 0], 0,
            ['==', ['get', 'color'], 'transparent'], 0,
            ['==', ['get', 'color'], 'rgba(0, 0, 0, 0)'], 0,
            ['<', ['get', 'intensityCode'], 101], 0.85,
            1.0
          ],
          'circle-stroke-width': [
            'case',
            ['<', ['get', 'intensityCode'], 0], 0,
            ['==', ['get', 'color'], 'transparent'], 0,
            ['==', ['get', 'color'], 'rgba(0, 0, 0, 0)'], 0,
            ['<', ['get', 'intensityCode'], 101], 0.5,
            1.5
          ],
          'circle-stroke-color': [
            'case',
            ['<', ['get', 'intensityCode'], 0], 'rgba(0, 0, 0, 0)',
            ['==', ['get', 'color'], 'transparent'], 'rgba(0, 0, 0, 0)',
            ['==', ['get', 'color'], 'rgba(0, 0, 0, 0)'], 'rgba(0, 0, 0, 0)',
            'rgba(255, 255, 255, 0.45)'
          ]
        }
      });

      // 관측소 마우스 이벤트
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('mousemove', 'intensity-points-layer', (e: any) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0];
          const props = feature.properties;
          if (!props || props.intensityCode < 0 || props.color === 'transparent' || props.color === 'rgba(0, 0, 0, 0)') {
            map.getCanvas().style.cursor = '';
            onHover(null);
            return;
          }
          map.getCanvas().style.cursor = 'pointer';

          const currentLng = i18n.language;
          const status = props.intensityCode >= 101
            ? (currentLng.startsWith('en') ? 'Shaking Detected' : currentLng.startsWith('ja') ? '揺れ検知中' : '지진동 감지중')
            : (currentLng.startsWith('en') ? 'Normal (Minor)' : currentLng.startsWith('ja') ? '平常時 (微震)' : '평시 (미감지)');

          const sourceLabel = currentDataSource === 'kmoni'
            ? (currentLng.startsWith('en') ? 'NIED' : currentLng.startsWith('ja') ? 'NIED 強震' : 'NIED 강진모니터')
            : (currentLng.startsWith('en') ? 'Yahoo!' : currentLng.startsWith('ja') ? 'Yahoo! 地震' : 'Yahoo! 지진');
          const transName = translateRegionName(props.name || '', currentLng);
          const stnLabel = currentLng.startsWith('en') ? 'Station' : currentLng.startsWith('ja') ? '観測点' : '관측소';

          onHover({
            type: 'station',
            title: transName !== props.name ? `${transName}` : props.name,
            subtitle: `${stnLabel}: ${props.name} (Code: ${props.code}) / ${status} [${sourceLabel}]`,
            x: e.point?.x,
            y: e.point?.y,
            scaleColor: props.color
          });
        }
      });

      map.on('mouseleave', 'intensity-points-layer', () => {
        map.getCanvas().style.cursor = '';
        onHover(null);
      });

      // 공통 콜백 정의
      const createDetectionCallbacks = (sourceType: DataSourceType) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPointsUpdated: (updatedGeojson: any) => {
          if (currentDataSource !== sourceType) return;
          const source = map.getSource('intensity-points');
          if (source) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (source as any).setData(updatedGeojson);
          }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDetectedUpdated: (detectedGeojson: any) => {
          if (currentDataSource !== sourceType && currentDataSource !== 'p2pquake') return;
          if (currentDataSource === 'p2pquake' && sourceType !== 'kmoni') return;
          const source = map.getSource('detected-grids');
          if (source) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (source as any).setData(detectedGeojson);
          }
        },
        onNewEventDetected: (center: [number, number]) => {
          if (currentDataSource !== sourceType && currentDataSource !== 'p2pquake') return;
          if (currentDataSource === 'p2pquake' && sourceType !== 'kmoni') return;
          if (onKmoniEventDetected) {
            onKmoniEventDetected(center);
          }
          map.flyTo({
            center: center,
            zoom: 6.2,
            speed: 1.2,
            curve: 1.4,
            essential: true
          });

          const currentService = sourceType === 'kmoni' ? kmoniQuakeService : yahooQuakeService;
          const topStns = currentService.getTopStations(1);
          const topStn = topStns[0];
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          const curJindo = topStn?.jindo ?? -0.5;
          const curJindoStr = topStn?.jindoStr ?? '0';

          if (onDetectionAlert) {
            onDetectionAlert({
              id: `${sourceType}-${Date.now()}`,
              source: sourceType,
              sourceName: sourceType.toUpperCase(),
              jindo: curJindo,
              jindoStr: curJindoStr,
              jindoFormatted: curJindo >= 0 ? `+${curJindo.toFixed(1)}` : curJindo.toFixed(1),
              color: topStn?.color || getExactJindoColor(curJindo),
              timestamp: Date.now(),
              timeStr,
              stationName: topStn?.fullName || topStn?.name,
              region: topStn?.region,
              center: center,
              isNewEvent: true
            });
          }
        },
        onEventsFinished: () => {
          if (currentDataSource !== sourceType && currentDataSource !== 'p2pquake') return;
          if (currentDataSource === 'p2pquake' && sourceType !== 'kmoni') return;
          
          if (currentDataSource !== 'p2pquake') {
            fitJapanBounds(map, true);
          }
          
          const source = map.getSource('detected-grids');
          if (source) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (source as any).setData({ type: 'FeatureCollection', features: [] });
          }

          if (onDetectionFinished) {
            onDetectionFinished();
          }
        },
        onSoundTriggered: (jindo: number, jindoStr: string) => {
          console.log(`[${sourceType.toUpperCase()} 지진 감지] 예상 진도: ${jindoStr} (${jindo.toFixed(1)})`);
          if (currentDataSource !== sourceType && currentDataSource !== 'p2pquake') return;
          if (currentDataSource === 'p2pquake' && sourceType !== 'kmoni') return;

          const currentService = sourceType === 'kmoni' ? kmoniQuakeService : yahooQuakeService;
          const topStns = currentService.getTopStations(1);
          const topStn = topStns[0];
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

          if (onDetectionAlert) {
            onDetectionAlert({
              id: `${sourceType}-${Date.now()}`,
              source: sourceType,
              sourceName: sourceType.toUpperCase(),
              jindo,
              jindoStr,
              jindoFormatted: jindo >= 0 ? `+${jindo.toFixed(1)}` : jindo.toFixed(1),
              color: getExactJindoColor(jindo),
              timestamp: Date.now(),
              timeStr,
              stationName: topStn?.fullName || topStn?.name,
              region: topStn?.region,
              center: topStn?.lonlat
            });
          }
        },
        onTopStationsUpdated: (topList: TopStationItem[]) => {
          if (currentDataSource !== sourceType && currentDataSource !== 'p2pquake') return;
          if (currentDataSource === 'p2pquake' && sourceType !== 'kmoni') return;
          if (onTopStationsUpdated) {
            onTopStationsUpdated(topList);
          }
        }
      });

      // 실시간 데이터 수신 핸들러 (SSE 스트림 및 폴백)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleServerPayload = (payload: any) => {
        if (!payload || !payload.intensities) return;
        const { source, intensities } = payload;

        if (source === 'kmoni' && (currentDataSource === 'kmoni' || currentDataSource === 'p2pquake')) {
          kmoniQuakeService.processKmoniParsedData(intensities, createDetectionCallbacks('kmoni'));
        } else if (source === 'yahoo' && currentDataSource === 'yahoo') {
          yahooQuakeService.processKmoniParsedData(intensities, createDetectionCallbacks('yahoo'));
        }
      };

      // 1. SSE (Server-Sent Events) 스트림 연결 (서버에서 1초마다 푸시)
      let eventSource: EventSource | null = null;
      const connectSSE = () => {
        try {
          if (eventSource) {
            eventSource.close();
          }
          eventSource = new EventSource('/api/intensity/stream');
          eventSource.onmessage = (e) => {
            try {
              const data = JSON.parse(e.data);
              handleServerPayload(data);
            } catch {}
          };
          eventSource.onerror = () => {
            if (eventSource) {
              eventSource.close();
              eventSource = null;
            }
            setTimeout(connectSSE, 3000);
          };
        } catch (err) {
          console.warn('[SSE Connection Failed, fallback to polling]:', err);
        }
      };

      connectSSE();

      // 2. 단건 REST 폴링 (초기 1회 및 백그라운드 복구용)
      let isFetching = false;
      const fetchRealTime = async () => {
        if (isFetching) return;
        isFetching = true;
        try {
          const srcParam = currentDataSource === 'yahoo' ? 'yahoo' : 'kmoni';
          const resp = await fetch(`/api/intensity/latest?source=${srcParam}`);
          if (resp.ok) {
            const data = await resp.json();
            handleServerPayload(data);
          }
        } catch (err) {
          // 조용히 스킵
        } finally {
          isFetching = false;
        }
      };

      fetchRealTime();
      const bgService = BackgroundSyncService.getInstance();
      bgService.registerWorkerInterval('realtime-station-fetch', fetchRealTime, 1500);
      const unregisterResume = bgService.onTabResume(() => {
        fetchRealTime();
        if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
          connectSSE();
        }
      });

      const setDataSource = (newSource: DataSourceType) => {
        if (currentDataSource === newSource) return;
        currentDataSource = newSource;

        if (newSource === 'p2pquake') {
          // P2PQuake 레이어 표시, 강진모니터 일반 관측소는 숨기되, 흔들림 감지 격자는 유지
          if (map.getLayer('intensity-points-layer')) {
            map.setLayoutProperty('intensity-points-layer', 'visibility', 'none');
          }
          if (map.getLayer('detected-grids-line')) {
            map.setLayoutProperty('detected-grids-line', 'visibility', 'visible');
          }
          if (map.getLayer('p2p-areas-fill')) {
            map.setLayoutProperty('p2p-areas-fill', 'visibility', 'visible');
          }
          if (map.getLayer('p2p-areas-line')) {
            map.setLayoutProperty('p2p-areas-line', 'visibility', 'visible');
          }
          if (map.getLayer('p2p-points-layer')) {
            map.setLayoutProperty('p2p-points-layer', 'visibility', 'visible');
          }
          if (map.getLayer('p2p-hypocenter-glow')) {
            map.setLayoutProperty('p2p-hypocenter-glow', 'visibility', 'visible');
          }
          if (map.getLayer('p2p-hypocenter-center')) {
            map.setLayoutProperty('p2p-hypocenter-center', 'visibility', 'visible');
          }
        } else {
          // 강진모니터 레이어 표시, P2PQuake 레이어 숨김
          if (map.getLayer('intensity-points-layer')) {
            map.setLayoutProperty('intensity-points-layer', 'visibility', 'visible');
          }
          if (map.getLayer('detected-grids-line')) {
            map.setLayoutProperty('detected-grids-line', 'visibility', 'visible');
          }
          if (map.getLayer('p2p-areas-fill')) {
            map.setLayoutProperty('p2p-areas-fill', 'visibility', 'none');
          }
          if (map.getLayer('p2p-areas-line')) {
            map.setLayoutProperty('p2p-areas-line', 'visibility', 'none');
          }
          if (map.getLayer('p2p-points-layer')) {
            map.setLayoutProperty('p2p-points-layer', 'visibility', 'none');
          }
          if (map.getLayer('p2p-hypocenter-glow')) {
            map.setLayoutProperty('p2p-hypocenter-glow', 'visibility', 'none');
          }
          if (map.getLayer('p2p-hypocenter-center')) {
            map.setLayoutProperty('p2p-hypocenter-center', 'visibility', 'none');
          }

          const activeGeojson = newSource === 'kmoni' ? kmoniQuakeService.geojson : yahooQuakeService.geojson;
          const source = map.getSource('intensity-points');
          if (source && activeGeojson) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (source as any).setData(activeGeojson);
          }

          const gridSource = map.getSource('detected-grids');
          if (gridSource) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (gridSource as any).setData({ type: 'FeatureCollection', features: [] });
          }

          // 새 소스로 즉시 1회 fetch
          fetchRealTime();
        }
      };

      const setP2PEvent = (event: P2PEarthquakeEvent | null) => {
        const pointsSource = map.getSource('p2p-points');
        const hypocenterSource = map.getSource('p2p-hypocenter');
        const areasSource = map.getSource('p2p-areas');

        if (!event) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (pointsSource) (pointsSource as any).setData({ type: 'FeatureCollection', features: [] });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (hypocenterSource) (hypocenterSource as any).setData({ type: 'FeatureCollection', features: [] });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (areasSource) (areasSource as any).setData({ type: 'FeatureCollection', features: [] });
          return;
        }

        // 1. 관측점 데이터 GeoJSON 변환
        const pointFeatures = event.points.map((pt) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [pt.lon, pt.lat]
          },
          properties: {
            pref: pt.pref,
            name: pt.name,
            scale: pt.scale,
            scaleStr: pt.scaleStr,
            color: pt.color
          }
        }));

        if (pointsSource) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pointsSource as any).setData({
            type: 'FeatureCollection',
            features: pointFeatures
          });
        }

        // 2. 진원지 마커 Feature
        if (event.hypocenter.latitude !== 0 && event.hypocenter.longitude !== 0) {
          const hypoFeature = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [event.hypocenter.longitude, event.hypocenter.latitude]
            },
            properties: {
              name: event.hypocenter.name,
              time: event.time,
              depth: event.hypocenter.depth,
              magnitude: event.hypocenter.magnitude,
              maxScaleStr: event.maxScaleStr
            }
          };
          if (hypocenterSource) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (hypocenterSource as any).setData({
              type: 'FeatureCollection',
              features: [hypoFeature]
            });
          }
        } else if (hypocenterSource) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (hypocenterSource as any).setData({
            type: 'FeatureCollection',
            features: []
          });
        }

        // 3. 지역(구역)별 진도 채색 GeoJSON 생성 (AreaForecastLocalE_GIS)
        if (areasSource && japanGeojson && Array.isArray(japanGeojson.features)) {
          const areaScaleMap = new Map<string, number>();

          // 포인트 목록으로부터 각 세분구역별 최대 진도 계산
          for (const pt of event.points) {
            let aCode = pt.areaCode;
            if (!aCode) {
              const matchedFeature = findAreaFeature(pt.lon, pt.lat, pt.pref, pt.name, japanGeojson.features);
              if (matchedFeature?.properties?.code) {
                aCode = String(matchedFeature.properties.code);
                pt.areaCode = aCode;
                pt.areaName = matchedFeature.properties.name;
              }
            }
            if (aCode) {
              const cur = areaScaleMap.get(aCode) || 0;
              if (pt.scale > cur) areaScaleMap.set(aCode, pt.scale);
            }
          }

          // raw.areas (구역 단위 발령 데이터) 처리
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawAreas = (event.raw as any)?.areas;
          console.log("areaScaleMap size:", areaScaleMap.size);
          if (Array.isArray(rawAreas)) {
            for (const ar of rawAreas) {
              const matchedFeature = findAreaFeature(0, 0, ar.pref || '', ar.name || '', japanGeojson.features);
              if (matchedFeature?.properties?.code) {
                const code = String(matchedFeature.properties.code);
                const scale = typeof ar.scale === 'number' ? ar.scale : 0;
                const cur = areaScaleMap.get(code) || 0;
                if (scale > cur) areaScaleMap.set(code, scale);
              }
            }
          }

          // 해당 구역 Feature 추출 및 진도 색상 지정
          const isEarthquakeTab = currentDataSource === 'p2pquake';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const areaFeatures: any[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const f of (japanGeojson.features as any[])) {
            const code = String(f.properties?.code || '');
            const scale = areaScaleMap.get(code);
            if (scale && scale >= 10) {
              const scaleInfo = formatScaleJMA(scale);
              areaFeatures.push({
                type: 'Feature',
                geometry: f.geometry,
                properties: {
                  code: f.properties?.code,
                  name: f.properties?.name,
                  namekana: f.properties?.namekana,
                  scale: scale,
                  scaleStr: scaleInfo.text,
                  color: scaleInfo.color, // 진도별 색상 매핑
                  opacity: isEarthquakeTab ? 0.88 : 0.65
                }
              });
            } else {
              areaFeatures.push({
                type: 'Feature',
                geometry: f.geometry,
                properties: {
                  code: f.properties?.code,
                  name: f.properties?.name,
                  namekana: f.properties?.namekana,
                  scale: 0,
                  scaleStr: '',
                  color: 'transparent',
                  opacity: 0
                }
              });
            }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (areasSource as any).setData({
            type: 'FeatureCollection',
            features: areaFeatures
          });
        }
      };

      const setKMAEvent = (event: any | null) => {
        const source = map.getSource('kma-hypocenter');
        if (!source) return;

        if (!event || !event.lat || !event.lon) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (source as any).setData({ type: 'FeatureCollection', features: [] });
          return;
        }

        const hypocenterFeature = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [event.lon, event.lat]
          },
          properties: {
            name: event.location,
            magnitude: event.magnitude,
            depth: event.depth,
            time: event.time
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (source as any).setData({
          type: 'FeatureCollection',
          features: [hypocenterFeature]
        });
      };

      return {
        setDataSource,
        getDataSource: () => currentDataSource,
        setP2PEvent,
        setKMAEvent,
        cleanup: () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          bgService.clearWorkerInterval('realtime-station-fetch');
          unregisterResume();
          if (updateInterval) window.clearInterval(updateInterval);
        }
      };
    } catch (err) {
      console.error('Failed to initialize stations:', err);
      return {
        setDataSource: () => {},
        getDataSource: () => currentDataSource,
        setP2PEvent: () => {},
        setKMAEvent: () => {},
        cleanup: () => {
          BackgroundSyncService.getInstance().clearWorkerInterval('realtime-station-fetch');
          if (updateInterval) window.clearInterval(updateInterval);
        }
      };
    }
  }
}
