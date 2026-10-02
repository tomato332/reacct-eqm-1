import { TopStationItem } from './QuakeDetectService';
import { WolfxEEWData } from './WolfxEEWService';
import { P2PEarthquakeEvent } from './P2PQuakeService';

export type DataSourceType = 'kmoni' | 'yahoo' | 'p2pquake';

export type SourceHealthStatus = 'online' | 'delayed' | 'offline';

export type HealthSourceId = 'wolfx' | 'p2p' | 'kmoni' | 'kma';

export interface DataSourceHealth {
  id: HealthSourceId;
  name: string;
  status: SourceHealthStatus;
  lastReceivedAt: number | null;
  detail?: string;
  latencyMs?: number;
}

export type SystemAlertStatus =
  | 'normal'
  | 'detecting'
  | 'warning'
  | 'critical'
  | 'offline';

export interface HoverInfo {
  type: 'prefecture' | 'station' | 'p2p_point' | 'p2p_hypocenter';
  title: string;
  subtitle?: string;
  extra?: string;
  x?: number;
  y?: number;
  scaleColor?: string;
}

export interface IGeoProvider {
  getWorldGeoUrl(): string;
  getJapanTopoUrl(): string;
  getIntensityPointsUrl(): string;
}

export interface MapRendererController {
  setDataSource: (source: DataSourceType) => void;
  getDataSource: () => DataSourceType;
  setP2PEvent: (event: P2PEarthquakeEvent | null) => void;
  setKMAEvent: (event: any | null) => void;
  // 리플레이 모드: 켜져 있는 동안 실시간 데이터가 지도 진도 점/감지 격자를 덮어쓰지 않는다
  setReplayMode: (on: boolean) => void;
  cleanup: () => void;
}

/** 서버 감지 이벤트 히스토리 항목 (GET /api/history, DetectedEventHistoryEntry와 동일 구조) */
export interface HistoryEntry {
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
  replay?: boolean;
}

export interface WaveStats {
  elapsedSec: number;
  pRadius: number;
  sRadius: number;
  // 지도 화면 중심까지의 파 도달 잔여 시간(초). null = 이미 도달했거나 계산 불가
  pArrivalSec: number | null;
  sArrivalSec: number | null;
}

export interface DetectionAlertInfo {
  id: string;
  source: DataSourceType;
  sourceName: string;
  jindo: number;
  jindoStr: string;
  jindoFormatted: string;
  color: string;
  timestamp: number;
  timeStr: string;
  stationName?: string;
  region?: string;
  center?: [number, number];
  isNewEvent?: boolean;
}

