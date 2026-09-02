import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import maplibregl from 'https://esm.sh/maplibre-gl@3';
import { TopStationItem } from './QuakeDetectService';
import { WolfxEEWService, WolfxEEWData, EEWContext, EEWState } from './WolfxEEWService';
import { P2PQuakeService, P2PEarthquakeEvent, P2PObservationPoint } from './P2PQuakeService';
import { loadJmaTravelTimeTable } from './travelTime';
import { BackgroundSyncService } from './backgroundSyncService';
import { DataSourceType, HoverInfo, IGeoProvider, MapRendererController, DetectionAlertInfo } from './types';
import { StaticGeoProvider, CleanVectorMapRenderer } from './MapRenderer';
import { JAPAN_BOUNDS, fitJapanBounds } from './zoomUtils';
import { useEEWWaves } from './hooks/useEEWWaves';
import { useEEWFusion, FusionContext } from './hooks/useEEWFusion';
import { translatePrefecture, translateRegionName, formatObservationPointName } from './translateUtils';

import { TopRightControls } from './components/TopRightControls';
import { EEWCard } from './components/EEWCard';
import { DetectionAlert } from './components/DetectionAlert';
import { Legend } from './components/Legend';
import { TopDashboard } from './components/TopDashboard';
import { InfoBadge } from './components/InfoBadge';
import { P2PQuakeCard } from './components/P2PQuakeCard';

import styles from './App.module.css';
import { audioService } from './AudioService';

export default function App() {
  useTranslation(); // Trigger re-render on language change
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const eewServiceRef = useRef<WolfxEEWService | null>(null);
  const p2pServiceRef = useRef<P2PQuakeService | null>(null);
  const mapControllerRef = useRef<MapRendererController | null>(null);

  const [dataSource, setDataSource] = useState<DataSourceType>('kmoni');
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [eewContext, setEewContext] = useState<EEWContext>({ state: EEWState.IDLE, data: null });
  const [topStations, setTopStations] = useState<TopStationItem[]>([]);
  const [kmoniDetectedCenter, setKmoniDetectedCenter] = useState<[number, number] | null>(null);
  const [isTopCollapsed, setIsTopCollapsed] = useState(false);
  const [detectionAlert, setDetectionAlert] = useState<DetectionAlertInfo | null>(null);
  const detectionTimerRef = useRef<number | null>(null);

  const handleDetectionAlert = (alert: DetectionAlertInfo) => {
    setDetectionAlert(alert);
    if (detectionTimerRef.current) {
      window.clearTimeout(detectionTimerRef.current);
    }
    detectionTimerRef.current = window.setTimeout(() => {
      setDetectionAlert(null);
    }, 15000);
  };

  const handleDismissDetection = () => {
    if (detectionTimerRef.current) {
      window.clearTimeout(detectionTimerRef.current);
    }
    setDetectionAlert(null);
  };

  // P2PQuake 551 States
  const [p2pEvents, setP2PEvents] = useState<P2PEarthquakeEvent[]>([]);
  const [selectedP2PEvent, setSelectedP2PEvent] = useState<P2PEarthquakeEvent | null>(null);
  const [isP2PCollapsed, setIsP2PCollapsed] = useState(false);

  // P/S파 실시간 전파 계산 훅
  const { waveStats } = useEEWWaves({
    mapRef,
    mapLoaded,
    eewContext,
    eewServiceRef,
  });

  const fusionContext = useEEWFusion(eewContext, topStations, kmoniDetectedCenter);

  const dataSourceRef = useRef<DataSourceType>(dataSource);
  dataSourceRef.current = dataSource;


  useEffect(() => {
    if (eewContext.state === EEWState.ACTIVE && eewContext.data) {
      audioService.playEEWChime();
    }
  }, [eewContext]);

  useEffect(() => {
    if (topStations.length > 0) {
      const maxInt = topStations[0].intensity;
      if (maxInt >= 1.0) {
        audioService.playUpdateBeep(maxInt);
      }
    }
  }, [topStations]);

  const handleToggleDataSource = (source: DataSourceType) => {
    setDataSource(source);
    setTopStations([]);
    setDetectionAlert(null);
    if (detectionTimerRef.current) {
      window.clearTimeout(detectionTimerRef.current);
    }
    if (mapControllerRef.current) {
      mapControllerRef.current.setDataSource(source);
    }

    if (source === 'p2pquake') {
      const targetEvent = selectedP2PEvent || p2pEvents[0] || (p2pServiceRef.current?.getLatestEvents()[0]);
      if (targetEvent && targetEvent.hypocenter.latitude !== 0 && targetEvent.hypocenter.longitude !== 0 && mapRef.current) {
        mapRef.current.flyTo({
          center: [targetEvent.hypocenter.longitude, targetEvent.hypocenter.latitude],
          zoom: 7.2,
          speed: 1.3,
          curve: 1.2,
          essential: true
        });
      }
    } else {
      // kmoni (NIED) or yahoo -> reset camera to full Japan bounds
      if (mapRef.current) {
        fitJapanBounds(mapRef.current, true);
      }
    }
  };

  const handleResetCamera = () => {
    if (mapRef.current) {
      fitJapanBounds(mapRef.current, true);
    }
  };

  const handleDismissEEW = () => {
    if (eewServiceRef.current) {
      eewServiceRef.current.clearEEW();
    }
  };

  const handleSelectStation = (stn: TopStationItem) => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: stn.lonlat,
        zoom: 8.2,
        speed: 1.4,
        curve: 1.2,
        essential: true
      });
      const currentLng = i18n.language;
      const transName = translateRegionName(stn.name || '', currentLng);
      const transRegion = translatePrefecture(stn.region || '', currentLng);
      const displayTitle = transRegion ? `${transRegion} ${transName}` : transName;

      const intensityLabel = currentLng.startsWith('en') ? 'Measured Intensity' : currentLng.startsWith('ja') ? '計測震度' : '계측진도';
      const scaleLabel = currentLng.startsWith('en') ? 'Intensity' : currentLng.startsWith('ja') ? '震度' : '진도';
      const stnLabel = currentLng.startsWith('en') ? 'Station' : currentLng.startsWith('ja') ? '観測点' : '관측소';

      let scaleStr = stn.jindoStr;
      if (currentLng.startsWith('en')) scaleStr = scaleStr.replace('강', '+').replace('약', '-');
      if (currentLng.startsWith('ja')) scaleStr = scaleStr.replace('강', '強').replace('약', '弱');

      setHoverInfo({
        type: 'station',
        title: displayTitle,
        subtitle: `${intensityLabel}: ${stn.jindoFormatted} (${scaleLabel} ${scaleStr}) / ${stnLabel}: ${stn.name} (Code: ${stn.intensityCode})`,
        scaleColor: stn.color
      });
    }
  };

  const handleSelectP2PEvent = (ev: P2PEarthquakeEvent) => {
    setSelectedP2PEvent(ev);
    if (dataSource !== 'p2pquake') {
      handleToggleDataSource('p2pquake');
    }
    
    if (mapControllerRef.current) {
      mapControllerRef.current.setP2PEvent(ev);
    }
    if (mapRef.current && ev.hypocenter.latitude !== 0 && ev.hypocenter.longitude !== 0) {
      mapRef.current.flyTo({
        center: [ev.hypocenter.longitude, ev.hypocenter.latitude],
        zoom: 6.8,
        speed: 1.3,
        essential: true
      });
    }
  };

  const handleFocusEpicenter = (lat: number, lon: number) => {
    if (mapRef.current && lat !== 0 && lon !== 0) {
      mapRef.current.flyTo({
        center: [lon, lat],
        zoom: 7.5,
        speed: 1.4,
        curve: 1.2,
        essential: true
      });
    }
  };

  const handleFocusPoint = (pt: P2PObservationPoint) => {
    if (mapRef.current && pt.lat !== 0 && pt.lon !== 0) {
      mapRef.current.flyTo({
        center: [pt.lon, pt.lat],
        zoom: 8.5,
        speed: 1.4,
        curve: 1.2,
        essential: true
      });
      const currentLng = i18n.language;
      const { fullTranslated } = formatObservationPointName(pt.pref, pt.name, currentLng);
      const obsScaleLabel = currentLng.startsWith('en') ? 'Observed Intensity' : currentLng.startsWith('ja') ? '観測震度' : '관측 진도';
      let scaleStr = pt.scaleStr;
      if (currentLng.startsWith('en')) scaleStr = scaleStr.replace('강', '+').replace('약', '-');
      if (currentLng.startsWith('ja')) scaleStr = scaleStr.replace('강', '強').replace('약', '弱');

      setHoverInfo({
        type: 'p2p_point',
        title: fullTranslated,
        subtitle: `${obsScaleLabel}: ${scaleStr}${pt.name && currentLng !== 'ja' ? ` [${pt.pref} ${pt.name}]` : ''}`,
        scaleColor: pt.color
      });
    }
  };

  // 1. JMA 주시표 및 EEW / P2PQuake 수신 서비스 초기화
  useEffect(() => {
    loadJmaTravelTimeTable('/tjma2001h_00000.json')
      .catch((e) => console.error('[JMA2001A Error]:', e));

    // Wolfx EEW Service
    const eewService = new WolfxEEWService();
    eewServiceRef.current = eewService;
    const unsubscribeEEW = eewService.subscribe((ctx) => setEewContext(ctx));

    // P2PQuake Service
    const p2pService = new P2PQuakeService();
    p2pServiceRef.current = p2pService;

    // Load JMA observation stations database (4,400+ stations)
    fetch('/JMAstations.json')
      .then((res) => res.json())
      .then((stations) => {
        if (Array.isArray(stations)) {
          p2pService.setJmaStations(stations);
        }
      })
      .catch((err) => console.warn('Failed to load JMAstations.json:', err));

    // Fallback station metadata for NIED
    fetch('/intensity-points-v1.json')
      .then((res) => res.json())
      .then((meta) => {
        if (Array.isArray(meta)) {
          p2pService.setStationMetas(meta);
        }
      })
      .catch((err) => console.warn('Failed to pass station metas to P2PQuakeService:', err));

    const unsubscribeP2P = p2pService.onEvent((ev) => {
      const allEvents = p2pService.getLatestEvents();
      setP2PEvents([...allEvents]);
      setSelectedP2PEvent((prev) => {
        const next = prev ? (prev.eventId === ev.eventId ? ev : prev) : ev;
        if (mapControllerRef.current) {
          mapControllerRef.current.setP2PEvent(next);
        }
        return next;
      });
    });

    p2pService.start();

    // 백그라운드 WakeLock 및 리사이즈 복구 등록
    const bgService = BackgroundSyncService.getInstance();
    bgService.requestWakeLock();

    const handleUserGesture = () => {
      bgService.enableAudioKeepAlive();
      bgService.requestWakeLock();
    };

    window.addEventListener('click', handleUserGesture, { passive: true });
    window.addEventListener('touchstart', handleUserGesture, { passive: true });

    const unregisterResume = bgService.onTabResume(() => {
      if (mapRef.current) {
        requestAnimationFrame(() => mapRef.current?.resize());
      }
    });

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
      unregisterResume();
      unsubscribeEEW();
      unsubscribeP2P();
      eewService.destroy();
      p2pService.destroy();
    };
  }, []);

  // 2. MapLibre 맵 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MapClass = (maplibregl as any).Map || maplibregl;
    const provider: IGeoProvider = new StaticGeoProvider();
    const mapRenderer = new CleanVectorMapRenderer();

    const map = new MapClass({
      container: containerRef.current,
      bounds: JAPAN_BOUNDS,
      fitBoundsOptions: {
        padding: { top: 35, bottom: 35, left: 35, right: 35 }
      },
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#0f172a' }
          }
        ]
      },
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    mapRef.current = map;
    let controller: MapRendererController | undefined;

    map.on('load', async () => {
      controller = await mapRenderer.render(
        map,
        provider.getWorldGeoUrl(),
        provider.getJapanTopoUrl(),
        provider.getIntensityPointsUrl(),
        (info) => setHoverInfo(info),
        (stations) => setTopStations(stations),
        (center) => setKmoniDetectedCenter(center),
        (alert) => handleDetectionAlert(alert),
        () => {}
      );
      mapControllerRef.current = controller;
      if (selectedP2PEvent) {
        controller.setP2PEvent(selectedP2PEvent);
      }
      setMapLoaded(true);
    });

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => map.resize());
    });
    observer.observe(containerRef.current);

    return () => {
      if (controller) controller.cleanup();
      observer.disconnect();
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (mapLoaded && mapControllerRef.current && selectedP2PEvent) {
      mapControllerRef.current.setP2PEvent(selectedP2PEvent);
    }
  }, [selectedP2PEvent, mapLoaded]);

  // 3. 다크 / 라이트 모드 색상 토글
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const bgColor = isDarkMode ? '#0f172a' : '#f1f5f9';
    const worldFill = isDarkMode ? '#1e293b' : '#e2e8f0';
    const worldLine = isDarkMode ? '#334155' : '#cbd5e1';
    const japanFill = isDarkMode ? '#334155' : '#ffffff';
    const japanLine = isDarkMode ? '#0f172a' : '#94a3b8';

    try {
      if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', bgColor);
      if (map.getLayer('world-fill')) map.setPaintProperty('world-fill', 'fill-color', worldFill);
      if (map.getLayer('world-line')) map.setPaintProperty('world-line', 'line-color', worldLine);
      if (map.getLayer('japan-fill')) map.setPaintProperty('japan-fill', 'fill-color', japanFill);
      if (map.getLayer('japan-line')) map.setPaintProperty('japan-line', 'line-color', japanLine);
    } catch (e) {
      console.warn('Failed to update map style for dark mode', e);
    }
  }, [isDarkMode, mapLoaded]);

  return (
    <div className={`${styles.container} ${isDarkMode ? styles.dark : ''}`}>
      <div ref={containerRef} className={styles.map} />

      <TopRightControls
        dataSource={dataSource}
        handleToggleDataSource={handleToggleDataSource}
        handleResetCamera={handleResetCamera}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      <div className={styles.leftSidebar}>
        <DetectionAlert
          alertInfo={detectionAlert}
          onDismiss={handleDismissDetection}
          onFocusLocation={handleFocusEpicenter}
        />

        {fusionContext.state !== EEWState.IDLE && fusionContext.data && (
          <EEWCard
            eewContext={fusionContext}
            waveStats={waveStats}
            handleDismissEEW={handleDismissEEW}
          />
        )}

        <P2PQuakeCard
          currentEvent={selectedP2PEvent}
          historyEvents={p2pEvents}
          onSelectEvent={handleSelectP2PEvent}
          onFocusEpicenter={handleFocusEpicenter}
          onFocusPoint={handleFocusPoint}
          isCollapsed={isP2PCollapsed}
          setIsCollapsed={setIsP2PCollapsed}
          listOnly={dataSource !== 'p2pquake'}
        />

        {dataSource !== 'p2pquake' && (
          <TopDashboard
            isTopCollapsed={isTopCollapsed}
            setIsTopCollapsed={setIsTopCollapsed}
            dataSource={dataSource}
            topStations={topStations}
            handleSelectStation={handleSelectStation}
          />
        )}
      </div>

      {hoverInfo && eewContext.state === EEWState.IDLE && <InfoBadge hoverInfo={hoverInfo} />}

      <Legend dataSource={dataSource} />
    </div>
  );
}

